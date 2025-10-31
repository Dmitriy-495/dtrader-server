/**
 * @file src/exchange/GateioWebSocket.ts
 * @version 4.1.0 - ИСПРАВЛЕН URL + вынесен в конфиг
 * @description WebSocket клиент для Gate.io Spot v4
 * @changelog
 *   4.1.0 - ИСПРАВЛЕН URL: /ws/v4/ вместо /v4/ws/spot (2025-01-22)
 *         - URL вынесен в конфиг (принимается в constructor)
 *   4.0.0 - Полный рефакторинг (2025-01-22)
 */

import WebSocket from "ws";
import { eventBus } from "../core/EventBus";
import { logger } from "../logger/Logger";
import { LogCategory } from "../logger/types";
import { GATEIO } from "../config/constants";

type GateioEvent = "subscribe" | "unsubscribe" | "update" | "error";
type SubscriptionStatus = "pending" | "subscribed" | "failed";

interface GateioWSMessage {
  time: number;
  time_ms?: number;
  channel: string;
  event: GateioEvent;
  error?: {
    code: number;
    message: string;
  };
  result?: any;
}

interface TickerData {
  currency_pair: string;
  last: string;
  lowest_ask: string;
  highest_bid: string;
  change_percentage: string;
  base_volume: string;
  quote_volume: string;
  high_24h: string;
  low_24h: string;
}

interface OrderBookUpdateData {
  t: number;
  s: string;
  U: number;
  u: number;
  b: [string, string][];
  a: [string, string][];
}

interface GateioWSConfig {
  wsUrl: string; // ✅ Добавлен обратно!
  currencyPair: string;
  pingInterval?: number;
  pongTimeout?: number;
  reconnectInterval?: number;
  maxReconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export class GateioWebSocket {
  // ============= CONSTANTS =============
  private static readonly DEFAULT_PING_INTERVAL = 15000;
  private static readonly DEFAULT_PONG_TIMEOUT = 30000;
  private static readonly DEFAULT_RECONNECT_INTERVAL = 5000;
  private static readonly MAX_RECONNECT_INTERVAL = 60000;

  // ============= STATE =============
  private ws: WebSocket | null = null;
  private wsUrl: string; // ✅ URL из конфига
  private config: Required<Omit<GateioWSConfig, "wsUrl">>;
  private isConnected = false;
  private shouldReconnect = true;

  private subscriptions = new Map<string, SubscriptionStatus>();

  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private currentReconnectInterval = 0;

  private pingTimer: NodeJS.Timeout | null = null;
  private pongTimer: NodeJS.Timeout | null = null;
  private lastPingTime = 0;
  private lastPongTime = 0;

  constructor(config: GateioWSConfig) {
    this.wsUrl = config.wsUrl; // ✅ Берём из конфига

    this.config = {
      currencyPair: config.currencyPair,
      pingInterval:
        config.pingInterval ?? GateioWebSocket.DEFAULT_PING_INTERVAL,
      pongTimeout: config.pongTimeout ?? GateioWebSocket.DEFAULT_PONG_TIMEOUT,
      reconnectInterval:
        config.reconnectInterval ?? GateioWebSocket.DEFAULT_RECONNECT_INTERVAL,
      maxReconnectInterval:
        config.maxReconnectInterval ?? GateioWebSocket.MAX_RECONNECT_INTERVAL,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 0,
    };

    this.currentReconnectInterval = this.config.reconnectInterval;

    logger.debug(
      `GateioWebSocket инициализирован: ${this.wsUrl} для ${this.config.currencyPair}`,
      LogCategory.EXCHANGE
    );
  }

  // ============= PUBLIC API =============

  public async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        logger.info(
          `Подключение к Gate.io WebSocket (${this.wsUrl})...`,
          LogCategory.EXCHANGE
        );

        this.ws = new WebSocket(this.wsUrl);

        this.ws.on("open", () => this.handleOpen(resolve));
        this.ws.on("message", (data) => this.handleMessage(data));
        this.ws.on("pong", () => this.handlePong());
        this.ws.on("close", (code, reason) => this.handleClose(code, reason));
        this.ws.on("error", (error) => this.handleError(error, reject));
      } catch (error) {
        logger.error("Ошибка создания WebSocket", LogCategory.EXCHANGE, error);
        reject(error);
      }
    });
  }

  public disconnect(): void {
    logger.info("Отключение от Gate.io WebSocket...", LogCategory.EXCHANGE);

    this.shouldReconnect = false;
    this.cleanup();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    this.subscriptions.clear();
  }

  public async subscribe(): Promise<void> {
    if (!this.isConnected) {
      throw new Error("WebSocket не подключен!");
    }

    logger.info(
      `Подписка на каналы для ${this.config.currencyPair}...`,
      LogCategory.EXCHANGE
    );

    await this.subscribeChannel(GATEIO.WS_CHANNELS.TICKERS, [
      this.config.currencyPair,
    ]);

    await this.subscribeChannel(GATEIO.WS_CHANNELS.ORDER_BOOK_UPDATE, [
      this.config.currencyPair,
      "100ms",
    ]);

    logger.success("✅ Подписка на каналы завершена", LogCategory.EXCHANGE);
  }

  public async unsubscribe(): Promise<void> {
    if (!this.isConnected) return;

    logger.info("Отписка от каналов...", LogCategory.EXCHANGE);

    for (const channel of this.subscriptions.keys()) {
      await this.unsubscribeChannel(channel);
    }
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

  // ============= PRIVATE: CONNECTION HANDLERS =============

  private handleOpen(resolve: () => void): void {
    this.isConnected = true;
    this.reconnectAttempts = 0;
    this.currentReconnectInterval = this.config.reconnectInterval;
    this.lastPongTime = Date.now();

    logger.success(
      "✅ WebSocket соединение с Gate.io установлено",
      LogCategory.EXCHANGE
    );

    eventBus.emitSafe("exchange:connected", {
      url: this.wsUrl,
      timestamp: Date.now(),
    });

    this.startPingPong();
    resolve();
  }

  private handleClose(code: number, reason: Buffer): void {
    this.isConnected = false;

    logger.warn(
      `⚠️ WebSocket закрыт (код: ${code})${
        reason.length ? `: ${reason.toString()}` : ""
      }`,
      LogCategory.EXCHANGE
    );

    eventBus.emitSafe("exchange:disconnected", {
      code,
      reason: reason.toString() || "unknown",
      timestamp: Date.now(),
    });

    this.cleanup();

    if (this.shouldReconnect) {
      this.scheduleReconnect();
    }
  }

  private handleError(error: Error, reject?: (error: Error) => void): void {
    logger.error("Ошибка WebSocket", LogCategory.EXCHANGE, {
      message: error.message,
    });

    eventBus.emitSafe("exchange:error", {
      message: error.message,
      timestamp: Date.now(),
    });

    if (reject) {
      reject(error);
    }
  }

  // ============= PRIVATE: MESSAGE HANDLING =============

  private handleMessage(data: WebSocket.Data): void {
    try {
      const raw = data.toString();
      const message = JSON.parse(raw) as GateioWSMessage;

      if (!message.channel || !message.event) {
        logger.warn("Некорректное сообщение от Gate.io", LogCategory.EXCHANGE);
        return;
      }

      logger.debug(
        `📨 WS: ${message.event} @ ${message.channel}`,
        LogCategory.EXCHANGE
      );

      switch (message.event) {
        case "subscribe":
          this.handleSubscribeEvent(message);
          break;

        case "unsubscribe":
          this.handleUnsubscribeEvent(message);
          break;

        case "update":
          this.handleUpdateEvent(message);
          break;

        case "error":
          this.handleErrorEvent(message);
          break;

        default:
          logger.warn(
            `Неизвестный тип события: ${message.event}`,
            LogCategory.EXCHANGE
          );
      }
    } catch (error) {
      logger.error(
        "Ошибка парсинга WebSocket сообщения",
        LogCategory.EXCHANGE,
        error
      );
    }
  }

  private handleSubscribeEvent(message: GateioWSMessage): void {
    this.subscriptions.set(message.channel, "subscribed");

    logger.info(
      `✅ Подписка подтверждена: ${message.channel}`,
      LogCategory.EXCHANGE
    );

    eventBus.emitSafe("exchange:subscribed", {
      channel: message.channel,
      timestamp: Date.now(),
    });
  }

  private handleUnsubscribeEvent(message: GateioWSMessage): void {
    this.subscriptions.delete(message.channel);

    logger.info(
      `Отписка подтверждена: ${message.channel}`,
      LogCategory.EXCHANGE
    );

    eventBus.emitSafe("exchange:unsubscribed", {
      channel: message.channel,
      timestamp: Date.now(),
    });
  }

  private handleUpdateEvent(message: GateioWSMessage): void {
    if (!message.result) {
      logger.warn("Update без result", LogCategory.EXCHANGE);
      return;
    }

    switch (message.channel) {
      case GATEIO.WS_CHANNELS.TICKERS:
        this.handleTickers(message.result);
        break;

      case GATEIO.WS_CHANNELS.ORDER_BOOK_UPDATE:
        this.handleOrderBookUpdate(message.result);
        break;

      default:
        logger.debug(
          `Данные от канала ${message.channel}`,
          LogCategory.EXCHANGE
        );
    }
  }

  private handleErrorEvent(message: GateioWSMessage): void {
    if (!message.error) return;

    logger.error(
      `Ошибка от Gate.io: ${message.error.message}`,
      LogCategory.EXCHANGE,
      {
        code: message.error.code,
        channel: message.channel,
      }
    );

    eventBus.emitSafe("exchange:error", {
      code: message.error.code,
      message: message.error.message,
      channel: message.channel,
      timestamp: Date.now(),
    });

    if (message.channel) {
      this.subscriptions.set(message.channel, "failed");
    }
  }

  // ============= PRIVATE: DATA HANDLERS =============

  private handleTickers(result: any): void {
    const tickers = Array.isArray(result) ? result : [result];

    tickers.forEach((ticker: TickerData) => {
      if (!this.isValidTicker(ticker)) {
        logger.warn("Некорректные данные тикера", LogCategory.EXCHANGE);
        return;
      }

      logger.debug(
        `📊 Тик: ${ticker.currency_pair} @ ${ticker.last}`,
        LogCategory.EXCHANGE
      );

      eventBus.emitSafe("data:tick:received", {
        symbol: ticker.currency_pair,
        price: parseFloat(ticker.last),
        volume: parseFloat(ticker.quote_volume),
        change24h: parseFloat(ticker.change_percentage),
        high24h: parseFloat(ticker.high_24h),
        low24h: parseFloat(ticker.low_24h),
        timestamp: Date.now(),
      });
    });
  }

  private handleOrderBookUpdate(result: OrderBookUpdateData): void {
    if (!this.isValidOrderBookUpdate(result)) {
      logger.warn("Некорректные данные orderbook", LogCategory.EXCHANGE);
      return;
    }

    logger.debug(
      `📖 OrderBook: ${result.s}, bids=${result.b.length}, asks=${result.a.length}`,
      LogCategory.EXCHANGE
    );

    eventBus.emitSafe("data:orderbook:updated", {
      symbol: result.s,
      bids: result.b.map(([price, amount]) => ({
        price: parseFloat(price),
        amount: parseFloat(amount),
      })),
      asks: result.a.map(([price, amount]) => ({
        price: parseFloat(price),
        amount: parseFloat(amount),
      })),
      timestamp: result.t,
      updateId: result.u,
    });
  }

  // ============= PRIVATE: VALIDATORS =============

  private isValidTicker(ticker: any): ticker is TickerData {
    return (
      ticker &&
      typeof ticker.currency_pair === "string" &&
      typeof ticker.last === "string" &&
      typeof ticker.quote_volume === "string" &&
      typeof ticker.change_percentage === "string" &&
      typeof ticker.high_24h === "string" &&
      typeof ticker.low_24h === "string"
    );
  }

  private isValidOrderBookUpdate(data: any): data is OrderBookUpdateData {
    return (
      data &&
      typeof data.t === "number" &&
      typeof data.s === "string" &&
      typeof data.u === "number" &&
      Array.isArray(data.b) &&
      Array.isArray(data.a)
    );
  }

  // ============= PRIVATE: SUBSCRIPTION MANAGEMENT =============

  private async subscribeChannel(
    channel: string,
    payload: any[]
  ): Promise<void> {
    if (!this.ws || !this.isConnected) {
      throw new Error("WebSocket не подключен");
    }

    this.subscriptions.set(channel, "pending");

    const message = {
      time: Math.floor(Date.now() / 1000),
      channel,
      event: "subscribe",
      payload,
    };

    logger.debug(`Подписка: ${channel}`, LogCategory.EXCHANGE, { payload });

    this.ws.send(JSON.stringify(message));

    await this.waitForSubscription(channel, 5000);
  }

  private async unsubscribeChannel(channel: string): Promise<void> {
    if (!this.ws || !this.isConnected) {
      return;
    }

    const message = {
      time: Math.floor(Date.now() / 1000),
      channel,
      event: "unsubscribe",
      payload: [],
    };

    this.ws.send(JSON.stringify(message));
    this.subscriptions.delete(channel);
  }

  private async waitForSubscription(
    channel: string,
    timeout: number
  ): Promise<void> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const status = this.subscriptions.get(channel);

        if (status === "subscribed") {
          clearInterval(checkInterval);
          resolve();
        } else if (status === "failed") {
          clearInterval(checkInterval);
          reject(new Error(`Подписка на ${channel} не удалась`));
        } else if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          reject(new Error(`Таймаут подписки на ${channel}`));
        }
      }, 100);
    });
  }

  // ============= PRIVATE: PING-PONG =============

  private startPingPong(): void {
    this.cleanup();

    this.pingTimer = setInterval(() => {
      this.sendPing();
    }, this.config.pingInterval);

    this.sendPing();
  }

  private sendPing(): void {
    if (!this.ws || !this.isConnected) {
      return;
    }

    this.lastPingTime = Date.now();
    this.ws.ping();

    eventBus.emitSafe("exchange:ping:sent", {
      timestamp: this.lastPingTime,
    });

    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
    }

    this.pongTimer = setTimeout(() => {
      this.handlePongTimeout();
    }, this.config.pongTimeout);
  }

  private handlePong(): void {
    const now = Date.now();
    const latency = now - this.lastPingTime;

    this.lastPongTime = now;

    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }

    eventBus.emitSafe("exchange:pong:received", {
      timestamp: now,
      latency,
    });
  }

  private handlePongTimeout(): void {
    logger.warn("⚠️ PONG timeout - переподключение...", LogCategory.EXCHANGE);

    eventBus.emitSafe("exchange:pong:timeout", {
      timestamp: Date.now(),
    });

    if (this.ws) {
      this.ws.terminate();
    }
  }

  // ============= PRIVATE: RECONNECT LOGIC =============

  private scheduleReconnect(): void {
    if (
      this.config.maxReconnectAttempts > 0 &&
      this.reconnectAttempts >= this.config.maxReconnectAttempts
    ) {
      logger.error(
        `Достигнут лимит попыток переподключения (${this.config.maxReconnectAttempts})`,
        LogCategory.EXCHANGE
      );
      return;
    }

    this.reconnectAttempts++;

    this.currentReconnectInterval = Math.min(
      this.currentReconnectInterval * 2,
      this.config.maxReconnectInterval
    );

    logger.info(
      `🔄 Переподключение через ${this.currentReconnectInterval}ms (попытка ${this.reconnectAttempts})`,
      LogCategory.EXCHANGE
    );

    eventBus.emitSafe("exchange:reconnecting", {
      attempt: this.reconnectAttempts,
      delay: this.currentReconnectInterval,
      timestamp: Date.now(),
    });

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
        await this.subscribe();
      } catch (error) {
        logger.error("Ошибка переподключения", LogCategory.EXCHANGE, error);
        this.scheduleReconnect();
      }
    }, this.currentReconnectInterval);
  }

  // ============= PRIVATE: CLEANUP =============

  private cleanup(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }

    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
