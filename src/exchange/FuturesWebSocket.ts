// ============================================================================
// FILE: src/exchange/FuturesWebSocket.ts
// Gate.io Futures WebSocket Client
// ============================================================================

import WebSocket from "ws";
import { eventBus } from "../core/EventBus";
import { logger } from "../logger/Logger";
import { LogCategory } from "../logger/types";
import { GATEIO } from "../config/constants";

interface FuturesWebSocketConfig {
  wsUrl: string;
  symbols: string[];
  pingInterval?: number;
  pongTimeout?: number;
  maxReconnectAttempts?: number;
}

interface SubscriptionRequest {
  time: number;
  channel: string;
  event: "subscribe" | "unsubscribe";
  payload: string[];
}

interface WebSocketMessage {
  time?: number;
  time_ms?: number;
  channel?: string;
  event?: string;
  error?: {
    code: number;
    message: string;
  };
  result?: any;
}

export class FuturesWebSocket {
  private ws: WebSocket | null = null;
  private readonly wsUrl: string;
  private readonly symbols: string[];
  private readonly pingInterval: number;
  private readonly pongTimeout: number;
  private readonly maxReconnectAttempts: number;

  private reconnectAttempts: number = 0;
  private isConnected: boolean = false;
  private shouldReconnect: boolean = true;
  private pingIntervalId: NodeJS.Timeout | null = null;
  private pongTimeoutId: NodeJS.Timeout | null = null;
  private lastPongTime: number = 0;
  private lastPingTime: number = 0;

  constructor(config: FuturesWebSocketConfig) {
    this.wsUrl = config.wsUrl;
    this.symbols = config.symbols;
    this.pingInterval = config.pingInterval || 15000;
    this.pongTimeout = config.pongTimeout || 30000;
    this.maxReconnectAttempts = config.maxReconnectAttempts || 10;

    logger.info(
      `🔧 FuturesWebSocket инициализирован для ${
        this.symbols.length
      } пар: ${this.symbols.join(", ")}`,
      LogCategory.SYSTEM
    );
  }

  // ==========================================================================
  // ПОДКЛЮЧЕНИЕ
  // ==========================================================================

  public async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info(
        `Подключение к Gate.io Futures WebSocket (${this.wsUrl})...`,
        LogCategory.EXCHANGE
      );

      this.ws = new WebSocket(this.wsUrl);

      const connectionTimeout = setTimeout(() => {
        if (!this.isConnected) {
          this.ws?.terminate();
          reject(new Error("WebSocket connection timeout"));
        }
      }, 30000);

      this.ws.on("open", () => {
        clearTimeout(connectionTimeout);
        this.isConnected = true;
        this.reconnectAttempts = 0;

        logger.success(
          "✅ Futures WebSocket соединение установлено",
          LogCategory.EXCHANGE
        );
        eventBus.emitSafe("exchange:connected", { timestamp: Date.now() });

        this.startPingPong();
        resolve();
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        this.handleMessage(data);
      });

      this.ws.on("error", (error: Error) => {
        logger.error("❌ Futures WebSocket ошибка", LogCategory.EXCHANGE, {
          error,
        });
        eventBus.emitSafe("exchange:error", { error });
      });

      this.ws.on("close", (code: number, reason: Buffer) => {
        this.isConnected = false;
        this.stopPingPong();

        logger.warn(
          `⚠️ Futures WebSocket закрыт (code: ${code}, reason: ${reason.toString()})`,
          LogCategory.EXCHANGE
        );

        eventBus.emitSafe("exchange:disconnected", { timestamp: Date.now() });

        if (this.shouldReconnect) {
          this.reconnect();
        }
      });

      this.ws.on("pong", () => {
        this.lastPongTime = Date.now();
        const latency = this.lastPongTime - this.lastPingTime;

        if (this.pongTimeoutId) {
          clearTimeout(this.pongTimeoutId);
          this.pongTimeoutId = null;
        }

        logger.info(
          `🏓 PONG получен [${new Date(
            this.lastPongTime
          ).toISOString()}] задержка: ${latency}ms`,
          LogCategory.EXCHANGE
        );

        eventBus.emitSafe("exchange:pong:received", {
          timestamp: this.lastPongTime,
          latency,
        });
      });
    });
  }

  // ==========================================================================
  // ПОДПИСКИ
  // ==========================================================================

  public async subscribe(): Promise<void> {
    if (!this.isConnected || !this.ws) {
      throw new Error("WebSocket не подключен");
    }

    logger.info(
      `Подписка на Futures каналы для ${this.symbols.length} пар...`,
      LogCategory.EXCHANGE
    );

    await this.subscribeChannel(
      GATEIO.FUTURES_WS_CHANNELS.TICKERS,
      this.symbols
    );

    await this.subscribeChannel(
      GATEIO.FUTURES_WS_CHANNELS.ORDER_BOOK_UPDATE,
      this.symbols.map((s) => `${s}@100ms`)
    );

    logger.success(
      "✅ Подписка на Futures каналы завершена",
      LogCategory.EXCHANGE
    );
    eventBus.emitSafe("system:ready", { timestamp: Date.now() });
  }

  private async subscribeChannel(
    channel: string,
    payload: string[]
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws || !this.isConnected) {
        reject(new Error("WebSocket не подключен"));
        return;
      }

      const request: SubscriptionRequest = {
        time: Math.floor(Date.now() / 1000),
        channel,
        event: "subscribe",
        payload,
      };

      logger.debug(
        `📡 Отправка подписки на канал: ${channel}`,
        LogCategory.EXCHANGE
      );

      this.ws.send(JSON.stringify(request));

      const timeout = setTimeout(() => {
        reject(new Error(`Timeout subscribing to ${channel}`));
      }, 5000);

      (this as any)[`_subscribe_${channel}`] = () => {
        clearTimeout(timeout);
        resolve();
      };
    });
  }

  public async unsubscribe(): Promise<void> {
    if (!this.isConnected || !this.ws) {
      return;
    }

    logger.info("Отписка от Futures каналов...", LogCategory.EXCHANGE);

    await this.unsubscribeChannel(
      GATEIO.FUTURES_WS_CHANNELS.TICKERS,
      this.symbols
    );

    await this.unsubscribeChannel(
      GATEIO.FUTURES_WS_CHANNELS.ORDER_BOOK_UPDATE,
      this.symbols.map((s) => `${s}@100ms`)
    );
  }

  private async unsubscribeChannel(
    channel: string,
    payload: string[]
  ): Promise<void> {
    if (!this.ws || !this.isConnected) {
      return;
    }

    const request: SubscriptionRequest = {
      time: Math.floor(Date.now() / 1000),
      channel,
      event: "unsubscribe",
      payload,
    };

    this.ws.send(JSON.stringify(request));
  }

  // ==========================================================================
  // ОБРАБОТКА СООБЩЕНИЙ
  // ==========================================================================

  private handleMessage(data: WebSocket.Data): void {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());

      if (message.error) {
        logger.error(
          `❌ Futures WS ошибка: ${message.error.message}`,
          LogCategory.EXCHANGE,
          { error: message.error }
        );
        return;
      }

      if (message.event === "subscribe") {
        this.handleSubscribeEvent(message);
        return;
      }

      if (message.event === "unsubscribe") {
        this.handleUnsubscribeEvent(message);
        return;
      }

      if (message.event === "update") {
        this.handleUpdateEvent(message);
        return;
      }
    } catch (error) {
      logger.error(
        "❌ Ошибка парсинга Futures WS сообщения",
        LogCategory.EXCHANGE,
        { error }
      );
    }
  }

  private handleSubscribeEvent(message: WebSocketMessage): void {
    const channel = message.channel;
    if (!channel) return;

    logger.info(`✅ Подписка подтверждена: ${channel}`, LogCategory.EXCHANGE);

    logger.info(`📡 Подписка на канал биржи: ${channel}`, LogCategory.EXCHANGE);

    const resolver = (this as any)[`_subscribe_${channel}`];
    if (resolver) {
      resolver();
      delete (this as any)[`_subscribe_${channel}`];
    }

    eventBus.emitSafe("exchange:subscribed", { channel });
  }

  private handleUnsubscribeEvent(message: WebSocketMessage): void {
    const channel = message.channel;
    if (!channel) return;

    logger.info(`✅ Отписка подтверждена: ${channel}`, LogCategory.EXCHANGE);

    eventBus.emitSafe("exchange:unsubscribed", { channel });
  }

  private handleUpdateEvent(message: WebSocketMessage): void {
    const channel = message.channel;
    if (!channel) return;

    switch (channel) {
      case GATEIO.FUTURES_WS_CHANNELS.TICKERS:
        this.handleTickers(message);
        break;

      case GATEIO.FUTURES_WS_CHANNELS.ORDER_BOOK_UPDATE:
        this.handleOrderBookUpdate(message);
        break;

      case GATEIO.FUTURES_WS_CHANNELS.TRADES:
        this.handleTrades(message);
        break;

      default:
        logger.debug(`Неизвестный канал: ${channel}`, LogCategory.EXCHANGE);
    }
  }

  // ==========================================================================
  // ОБРАБОТЧИКИ ДАННЫХ
  // ==========================================================================

  private handleTickers(message: WebSocketMessage): void {
    const result = message.result;
    if (!result) return;

    const ticker = {
      symbol: result.contract,
      price: parseFloat(result.last),
      volume: parseFloat(result.volume_24h || result.total_size || "0"),
      change24h: parseFloat(result.change_percentage || "0"),
      high24h: parseFloat(result.high_24h || "0"),
      low24h: parseFloat(result.low_24h || "0"),
      timestamp: Date.now(),
    };

    eventBus.emitSafe("data:tick:received", ticker);
  }

  private handleOrderBookUpdate(message: WebSocketMessage): void {
    const result = message.result;
    if (!result) return;

    const update = {
      symbol: result.contract || result.s,
      bids: (result.bids || result.b || []).map((bid: any) => {
        if (Array.isArray(bid)) {
          return {
            price: parseFloat(bid[0]),
            amount: parseFloat(bid[1]),
          };
        } else {
          return {
            price: parseFloat(bid.p),
            amount: parseFloat(bid.s),
          };
        }
      }),
      asks: (result.asks || result.a || []).map((ask: any) => {
        if (Array.isArray(ask)) {
          return {
            price: parseFloat(ask[0]),
            amount: parseFloat(ask[1]),
          };
        } else {
          return {
            price: parseFloat(ask.p),
            amount: parseFloat(ask.s),
          };
        }
      }),
      updateId: result.u || result.id || Date.now(),
      timestamp: message.time_ms || Date.now(),
    };

    eventBus.emitSafe("data:orderbook:updated", update);
  }

  private handleTrades(message: WebSocketMessage): void {
    logger.debug("Trade received", LogCategory.EXCHANGE, { message });
  }

  // ==========================================================================
  // PING-PONG
  // ==========================================================================

  private startPingPong(): void {
    this.pingIntervalId = setInterval(() => {
      if (this.ws && this.isConnected) {
        this.lastPingTime = Date.now();

        logger.info(
          `🏓 PING отправлен [${new Date(this.lastPingTime).toISOString()}]`,
          LogCategory.EXCHANGE
        );

        this.ws.ping();

        eventBus.emitSafe("exchange:ping:sent", {
          timestamp: this.lastPingTime,
        });

        this.pongTimeoutId = setTimeout(() => {
          logger.warn(
            "⚠️ PONG не получен в течение 30 секунд",
            LogCategory.EXCHANGE
          );

          eventBus.emitSafe("exchange:pong:timeout", {
            timestamp: Date.now(),
          });

          this.ws?.terminate();
        }, this.pongTimeout);
      }
    }, this.pingInterval);
  }

  private stopPingPong(): void {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }

    if (this.pongTimeoutId) {
      clearTimeout(this.pongTimeoutId);
      this.pongTimeoutId = null;
    }
  }

  // ==========================================================================
  // ПЕРЕПОДКЛЮЧЕНИЕ
  // ==========================================================================

  private async reconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error(
        `❌ Достигнут лимит попыток переподключения (${this.maxReconnectAttempts})`,
        LogCategory.EXCHANGE
      );
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      5000 * Math.pow(2, this.reconnectAttempts - 1),
      60000
    );

    logger.info(
      `🔄 Переподключение к Futures WebSocket (попытка ${this.reconnectAttempts}/${this.maxReconnectAttempts}) через ${delay}ms...`,
      LogCategory.EXCHANGE
    );

    eventBus.emitSafe("exchange:reconnecting", {
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      delay,
    });

    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      await this.connect();
      await this.subscribe();

      logger.success(
        "✅ Переподключение к Futures WebSocket успешно",
        LogCategory.EXCHANGE
      );
    } catch (error) {
      logger.error(
        "❌ Ошибка переподключения к Futures WebSocket",
        LogCategory.EXCHANGE,
        { error }
      );
      this.reconnect();
    }
  }

  // ==========================================================================
  // УПРАВЛЕНИЕ
  // ==========================================================================

  public disconnect(): void {
    this.shouldReconnect = false;
    this.stopPingPong();

    if (this.ws) {
      logger.info(
        "Отключение от Gate.io Futures WebSocket...",
        LogCategory.EXCHANGE
      );
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
  }

  public isConnectedToExchange(): boolean {
    return this.isConnected;
  }

  public getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  public getLastPongTime(): number {
    return this.lastPongTime;
  }
}
