/**
 * @file src/exchange/GateioWebSocket.ts
 * @version 2
 * @description WebSocket клиент для Gate.io (real-time данные)
 * @changelog
 *   2 - Убрано прямое логирование ping/pong (теперь через события) (2025-01-22)
 *   1 - Исправлен ping-pong механизм (native WebSocket pong) (2025-01-22)
 *   0 - Первая версия (2025-01-22)
 */

import WebSocket from "ws";
import { eventBus } from "../core/EventBus";
import { logger } from "../logger/Logger";
import { LogCategory } from "../logger/types";
import { GATEIO } from "../config/constants";

/**
 * Типы WebSocket сообщений от Gate.io
 */
interface GateioWSMessage {
  time: number;
  time_ms?: number;
  channel: string;
  event: string;
  error?: {
    code: number;
    message: string;
  };
  result?: any;
}

/**
 * Ticker данные из WebSocket
 */
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

/**
 * OrderBook update данные из WebSocket
 */
interface OrderBookUpdateData {
  t: number; // Timestamp в миллисекундах
  e: string; // Event type: "update"
  E: number; // Event time
  s: string; // Symbol (currency_pair)
  U: number; // First update ID
  u: number; // Last update ID
  b: [string, string][]; // Bids [[price, amount], ...]
  a: [string, string][]; // Asks [[price, amount], ...]
}

/**
 * Конфигурация WebSocket клиента
 */
interface GateioWSConfig {
  /** URL WebSocket сервера Gate.io */
  wsUrl: string;

  /** Торговая пара для подписки */
  currencyPair: string;

  /** Интервал ping в миллисекундах (по умолчанию: 15000) */
  pingInterval?: number;

  /** Таймаут ожидания pong в миллисекундах (по умолчанию: 30000) */
  pongTimeout?: number;

  /** Интервал переподключения в миллисекундах (по умолчанию: 5000) */
  reconnectInterval?: number;

  /** Максимальное количество попыток переподключения (0 = бесконечно) */
  maxReconnectAttempts?: number;
}

/**
 * WebSocket клиент для Gate.io
 *
 * Функции:
 * - Подключение к Gate.io WebSocket API
 * - Подписка на тики (spot.tickers)
 * - Подписка на обновления orderbook (spot.order_book_update)
 * - Ping-Pong механизм для контроля соединения (native WebSocket pong)
 * - Автоматическое переподключение при потере связи
 * - Эмиты событий через EventBus
 *
 * @example
 * const ws = new GateioWebSocket({
 *   wsUrl: 'wss://api.gateio.ws/ws/v4/',
 *   currencyPair: 'ETH_USDT',
 * });
 *
 * await ws.connect();
 * await ws.subscribe();
 */
export class GateioWebSocket {
  private ws: WebSocket | null = null;
  private config: Required<GateioWSConfig>;
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private pongTimer: NodeJS.Timeout | null = null;
  private lastPongTime: number = 0;
  private lastPingTime: number = 0;
  private isConnected: boolean = false;
  private isSubscribed: boolean = false;
  private shouldReconnect: boolean = true;

  /**
   * Конструктор
   *
   * @param config - конфигурация WebSocket клиента
   */
  constructor(config: GateioWSConfig) {
    this.config = {
      wsUrl: config.wsUrl,
      currencyPair: config.currencyPair,
      pingInterval: config.pingInterval || GATEIO.TIMEOUTS.PING_INTERVAL,
      pongTimeout: config.pongTimeout || GATEIO.TIMEOUTS.PONG_TIMEOUT,
      reconnectInterval: config.reconnectInterval || 5000,
      maxReconnectAttempts: config.maxReconnectAttempts || 0,
    };

    logger.debug("GateioWebSocket инициализирован", LogCategory.EXCHANGE, {
      wsUrl: this.config.wsUrl,
      currencyPair: this.config.currencyPair,
    });
  }

  /**
   * Подключение к Gate.io WebSocket
   *
   * @returns Promise, который резолвится при успешном подключении
   */
  public async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        logger.info("Подключение к Gate.io WebSocket...", LogCategory.EXCHANGE);

        // Создаём WebSocket соединение
        this.ws = new WebSocket(this.config.wsUrl);

        // Обработка открытия соединения
        this.ws.on("open", () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.lastPongTime = Date.now();
          this.lastPingTime = Date.now();

          logger.success(
            "✅ WebSocket соединение с Gate.io установлено",
            LogCategory.EXCHANGE
          );

          // Эмитим событие подключения
          eventBus.emitSafe("exchange:connected", {
            wsUrl: this.config.wsUrl,
            timestamp: Date.now(),
          });

          // Запускаем ping механизм
          this.startPingPong();

          resolve();
        });

        // Обработка сообщений
        this.ws.on("message", (data: WebSocket.Data) => {
          this.handleMessage(data);
        });

        // ✅ ИСПРАВЛЕНИЕ: Обработка native WebSocket pong
        this.ws.on("pong", () => {
          this.handleNativePong();
        });

        // Обработка закрытия соединения
        this.ws.on("close", (code: number, reason: Buffer) => {
          this.handleClose(code, reason.toString());
        });

        // Обработка ошибок
        this.ws.on("error", (error: Error) => {
          this.handleError(error);
          reject(error);
        });
      } catch (error) {
        logger.error(
          "Ошибка при подключении к WebSocket",
          LogCategory.EXCHANGE,
          error
        );
        reject(error);
      }
    });
  }

  /**
   * Отключение от Gate.io WebSocket
   */
  public disconnect(): void {
    logger.info("Отключение от Gate.io WebSocket...", LogCategory.EXCHANGE);

    this.shouldReconnect = false;
    this.stopPingPong();
    this.stopReconnect();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    this.isSubscribed = false;
  }

  /**
   * Подписка на каналы Gate.io
   *
   * Подписывается на:
   * - spot.tickers (тики)
   * - spot.order_book_update (обновления orderbook)
   */
  public async subscribe(): Promise<void> {
    if (!this.isConnected) {
      throw new Error("WebSocket не подключен! Сначала вызовите connect()");
    }

    logger.info(
      `Подписка на каналы для ${this.config.currencyPair}...`,
      LogCategory.EXCHANGE
    );

    // Подписка на тики
    await this.subscribeChannel(GATEIO.WS_CHANNELS.TICKERS, [
      this.config.currencyPair,
    ]);

    // Подписка на orderbook updates
    await this.subscribeChannel(GATEIO.WS_CHANNELS.ORDER_BOOK_UPDATE, [
      this.config.currencyPair,
      "100ms",
    ]);

    this.isSubscribed = true;

    logger.success("✅ Подписка на каналы успешна", LogCategory.EXCHANGE);
  }

  /**
   * Отписка от каналов Gate.io
   */
  public async unsubscribe(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    logger.info("Отписка от каналов...", LogCategory.EXCHANGE);

    // Отписка от тиков
    await this.unsubscribeChannel(GATEIO.WS_CHANNELS.TICKERS, [
      this.config.currencyPair,
    ]);

    // Отписка от orderbook updates
    await this.unsubscribeChannel(GATEIO.WS_CHANNELS.ORDER_BOOK_UPDATE, [
      this.config.currencyPair,
      "100ms",
    ]);

    this.isSubscribed = false;
  }

  /**
   * Подписка на конкретный канал
   *
   * @param channel - название канала
   * @param payload - данные для подписки
   */
  private async subscribeChannel(
    channel: string,
    payload: any[]
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws || !this.isConnected) {
        reject(new Error("WebSocket не подключен"));
        return;
      }

      const message = {
        time: Math.floor(Date.now() / 1000),
        channel,
        event: "subscribe",
        payload,
      };

      logger.debug(`Подписка на канал: ${channel}`, LogCategory.EXCHANGE, {
        payload,
      });

      // Отправляем подписку
      this.ws.send(JSON.stringify(message));

      // Gate.io не всегда отправляет подтверждение подписки сразу
      // Даём небольшую задержку
      setTimeout(() => {
        eventBus.emitSafe("exchange:subscribed", { channel, payload });
        resolve();
      }, 500);
    });
  }

  /**
   * Отписка от конкретного канала
   *
   * @param channel - название канала
   * @param payload - данные для отписки
   */
  private async unsubscribeChannel(
    channel: string,
    payload: any[]
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws || !this.isConnected) {
        reject(new Error("WebSocket не подключен"));
        return;
      }

      const message = {
        time: Math.floor(Date.now() / 1000),
        channel,
        event: "unsubscribe",
        payload,
      };

      logger.debug(`Отписка от канала: ${channel}`, LogCategory.EXCHANGE, {
        payload,
      });

      this.ws.send(JSON.stringify(message));

      setTimeout(() => {
        eventBus.emitSafe("exchange:unsubscribed", { channel, payload });
        resolve();
      }, 500);
    });
  }

  /**
   * Обработка входящих сообщений от Gate.io
   *
   * @param data - сырые данные от WebSocket
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const message: GateioWSMessage = JSON.parse(data.toString());

      // ✅ ИСПРАВЛЕНИЕ: Обработка application-level pong (если придёт)
      if (message.event === "update" && message.channel === "spot.pong") {
        this.handleApplicationPong();
        return;
      }

      // Обработка ошибок
      if (message.error) {
        logger.error(
          `Ошибка от Gate.io WebSocket: ${message.error.message}`,
          LogCategory.EXCHANGE,
          message.error
        );

        eventBus.emitSafe("exchange:error", {
          code: message.error.code,
          message: message.error.message,
        });

        return;
      }

      // Обработка данных по каналам
      if (message.event === "update" && message.result) {
        this.handleChannelData(message.channel, message.result);
      }
    } catch (error) {
      logger.error(
        "Ошибка парсинга сообщения от WebSocket",
        LogCategory.EXCHANGE,
        error
      );
    }
  }

  /**
   * Обработка данных по каналам
   *
   * @param channel - название канала
   * @param result - данные
   */
  private handleChannelData(channel: string, result: any): void {
    switch (channel) {
      case GATEIO.WS_CHANNELS.TICKERS:
        this.handleTicker(result);
        break;

      case GATEIO.WS_CHANNELS.ORDER_BOOK_UPDATE:
        this.handleOrderBookUpdate(result);
        break;

      default:
        logger.debug(
          `Получены данные из канала ${channel}`,
          LogCategory.EXCHANGE
        );
    }
  }

  /**
   * Обработка тикера
   *
   * @param data - данные тикера
   */
  private handleTicker(data: TickerData): void {
    logger.debug(
      `Тик получен: ${data.currency_pair} @ ${data.last}`,
      LogCategory.EXCHANGE
    );

    // Эмитим событие получения тика
    eventBus.emitSafe("data:tick:received", {
      symbol: data.currency_pair,
      price: parseFloat(data.last),
      volume: parseFloat(data.quote_volume),
      change24h: parseFloat(data.change_percentage),
      high24h: parseFloat(data.high_24h),
      low24h: parseFloat(data.low_24h),
      timestamp: Date.now(),
    });
  }

  /**
   * Обработка обновления orderbook
   *
   * @param data - данные обновления
   */
  private handleOrderBookUpdate(data: OrderBookUpdateData): void {
    logger.debug(
      `OrderBook update: ${data.s}, bids: ${data.b.length}, asks: ${data.a.length}`,
      LogCategory.EXCHANGE
    );

    // Эмитим событие обновления orderbook
    eventBus.emitSafe("data:orderbook:updated", {
      symbol: data.s,
      bids: data.b.map(([price, amount]) => ({
        price: parseFloat(price),
        amount: parseFloat(amount),
      })),
      asks: data.a.map(([price, amount]) => ({
        price: parseFloat(price),
        amount: parseFloat(amount),
      })),
      timestamp: data.t,
      updateId: data.u,
    });
  }

  /**
   * Запуск ping-pong механизма
   */
  private startPingPong(): void {
    // Останавливаем предыдущие таймеры если есть
    this.stopPingPong();

    // Запускаем периодический ping
    this.pingTimer = setInterval(() => {
      this.sendPing();
    }, this.config.pingInterval);

    // Отправляем первый ping сразу
    this.sendPing();
  }

  /**
   * Остановка ping-pong механизма
   */
  private stopPingPong(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }

    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  /**
   * ✅ ИСПРАВЛЕНИЕ: Отправка NATIVE WebSocket ping
   *
   * Gate.io отвечает на native WebSocket ping frames,
   * а не на application-level ping сообщения!
   */
  private sendPing(): void {
    if (!this.ws || !this.isConnected) {
      return;
    }

    this.lastPingTime = Date.now();

    // ✅ УБРАНО прямое логирование - теперь через событие
    // logger.debug(`🏓 PING отправлен [${timestamp}]`, LogCategory.EXCHANGE);

    // ИСПОЛЬЗУЕМ NATIVE WebSocket ping
    this.ws.ping();

    // Эмитим событие отправки ping (Logger подхватит)
    eventBus.emitSafe("exchange:ping:sent", {
      timestamp: this.lastPingTime,
    });

    // Запускаем таймер ожидания pong
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
    }

    this.pongTimer = setTimeout(() => {
      this.handlePongTimeout();
    }, this.config.pongTimeout);
  }

  /**
   * ✅ ИСПРАВЛЕНИЕ: Обработка NATIVE WebSocket pong
   */
  private handleNativePong(): void {
    const now = Date.now();
    const latency = now - this.lastPingTime;

    // ✅ УБРАНО прямое логирование - теперь через событие
    // logger.info(`🏓 PONG получен [${timestamp}] задержка: ${latency}ms`, LogCategory.EXCHANGE);

    this.lastPongTime = now;

    // Останавливаем таймер pong timeout
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }

    // Эмитим событие получения pong (Logger подхватит)
    eventBus.emitSafe("exchange:pong:received", {
      timestamp: now,
      latency,
    });
  }

  /**
   * Обработка application-level pong (если Gate.io всё-таки отправит)
   */
  private handleApplicationPong(): void {
    const now = Date.now();
    const latency = now - this.lastPingTime;

    // ✅ УБРАНО прямое логирование
    // logger.info(`🏓 APP PONG получен [${timestamp}] задержка: ${latency}ms`, LogCategory.EXCHANGE);

    this.lastPongTime = now;

    // Останавливаем таймер pong timeout
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }

    // Эмитим событие получения pong
    eventBus.emitSafe("exchange:pong:received", {
      timestamp: now,
      latency,
    });
  }

  /**
   * Обработка таймаута pong (не получен в течение заданного времени)
   */
  private handlePongTimeout(): void {
    logger.warn("⚠️ PONG не получен в течение 30 секунд", LogCategory.EXCHANGE);

    // Эмитим событие таймаута pong
    eventBus.emitSafe("exchange:pong:timeout", {
      timestamp: Date.now(),
    });

    // Переподключаемся
    this.reconnect();
  }

  /**
   * Обработка закрытия соединения
   *
   * @param code - код закрытия
   * @param reason - причина закрытия
   */
  private handleClose(code: number, reason: string): void {
    this.isConnected = false;
    this.isSubscribed = false;

    logger.warn(
      `⚠️ WebSocket соединение с Gate.io разорвано (код: ${code})${
        reason ? `: ${reason}` : ""
      }`,
      LogCategory.EXCHANGE
    );

    // Эмитим событие отключения
    eventBus.emitSafe("exchange:disconnected", {
      code,
      reason: reason || "unknown",
      timestamp: Date.now(),
    });

    // Останавливаем ping-pong
    this.stopPingPong();

    // Переподключаемся если нужно
    if (this.shouldReconnect) {
      this.reconnect();
    }
  }

  /**
   * Обработка ошибок WebSocket
   *
   * @param error - объект ошибки
   */
  private handleError(error: Error): void {
    logger.error("Ошибка WebSocket", LogCategory.EXCHANGE, error);

    // Эмитим событие ошибки
    eventBus.emitSafe("exchange:error", {
      message: error.message,
      timestamp: Date.now(),
    });
  }

  /**
   * Переподключение к Gate.io WebSocket
   */
  private reconnect(): void {
    // Проверяем лимит попыток
    if (
      this.config.maxReconnectAttempts > 0 &&
      this.reconnectAttempts >= this.config.maxReconnectAttempts
    ) {
      logger.error(
        `Достигнуто максимальное количество попыток переподключения (${this.config.maxReconnectAttempts})`,
        LogCategory.EXCHANGE
      );
      return;
    }

    this.reconnectAttempts++;

    logger.info(
      `🔄 Переподключение к Gate.io (попытка ${this.reconnectAttempts})...`,
      LogCategory.EXCHANGE
    );

    // Эмитим событие переподключения
    eventBus.emitSafe("exchange:reconnecting", {
      attempt: this.reconnectAttempts,
      timestamp: Date.now(),
    });

    // Закрываем старое соединение если есть
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }

    // Переподключаемся через заданный интервал
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();

        // Восстанавливаем подписки
        if (this.isSubscribed) {
          await this.subscribe();
        }
      } catch (error) {
        logger.error("Ошибка при переподключении", LogCategory.EXCHANGE, error);
        this.reconnect();
      }
    }, this.config.reconnectInterval);
  }

  /**
   * Остановка процесса переподключения
   */
  private stopReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.reconnectAttempts = 0;
  }

  /**
   * Получить статус подключения
   *
   * @returns true если подключен
   */
  public isConnectedToExchange(): boolean {
    return this.isConnected;
  }

  /**
   * Получить статус подписки
   *
   * @returns true если подписан на каналы
   */
  public isSubscribedToChannels(): boolean {
    return this.isSubscribed;
  }

  /**
   * Получить количество попыток переподключения
   *
   * @returns количество попыток
   */
  public getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  /**
   * Получить время последнего pong
   *
   * @returns Unix timestamp в миллисекундах
   */
  public getLastPongTime(): number {
    return this.lastPongTime;
  }
}
