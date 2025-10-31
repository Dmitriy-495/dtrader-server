/**
 * @file src/logger/Logger.ts
 * @version 2
 * @description Централизованная система логирования с интеграцией Event Bus
 * @changelog
 *   2 - Все exchange события идут в канал system (2025-01-22)
 *   1 - Убрано дублирование pong логов, убран лог ping:sent (2025-01-22)
 *   0 - Первая версия (2025-01-22)
 */

import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";
import { eventBus } from "../core/EventBus";
import { LogLevel, LogCategory, LogMessage, LoggerConfig } from "./types";
import { config } from "../config/env";
import { EMOJI } from "../config/constants";

/**
 * Централизованный логгер с поддержкой Event Bus
 *
 * Категории логов и каналы WebSocket:
 * - LogCategory.SYSTEM → канал 'system' (автоматическая подписка)
 * - LogCategory.EXCHANGE → канал 'system' (автоматическая подписка)
 * - LogCategory.INTERNAL → канал 'logs' (требует подписки)
 */
class Logger {
  private static instance: Logger;
  private config: LoggerConfig;

  /**
   * Приоритет уровней логирования (для фильтрации)
   */
  private levelPriority: Record<LogLevel, number> = {
    [LogLevel.DEBUG]: 0,
    [LogLevel.INFO]: 1,
    [LogLevel.SUCCESS]: 1,
    [LogLevel.WARN]: 2,
    [LogLevel.ERROR]: 3,
  };

  private constructor() {
    this.config = {
      level: config.logging.level as LogLevel,
      toFile: config.logging.toFile,
      dir: config.logging.dir,
      colors: true,
    };

    // Создаём директорию для логов если нужно
    if (this.config.toFile) {
      this.ensureLogDir();
    }

    // Подписываемся на события для автологирования
    this.setupEventListeners();
  }

  /**
   * Singleton pattern
   */
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Подписка на события для автоматического логирования
   *
   * ✅ ВАЖНО: События exchange:* и system:* идут в канал 'system'
   */
  private setupEventListeners(): void {
    // ==================== EXCHANGE СОБЫТИЯ (канал system) ====================

    eventBus.on("exchange:connected", () => {
      this.success("✅ WebSocket соединение установлено", LogCategory.EXCHANGE);
    });

    eventBus.on("exchange:disconnected", (data: any) => {
      this.warn(
        `⚠️ WebSocket соединение разорвано: ${data?.reason || "unknown"}`,
        LogCategory.EXCHANGE
      );
    });

    eventBus.on("exchange:reconnecting", (data: any) => {
      this.info(
        `🔄 Переподключение к WebSocket (попытка ${data?.attempt || "?"})...`,
        LogCategory.EXCHANGE
      );
    });

    eventBus.on("exchange:ping:sent", (data: any) => {
      const time = new Date(data?.timestamp).toISOString();
      this.debug(`🏓 PING отправлен [${time}]`, LogCategory.EXCHANGE);
    });

    eventBus.on("exchange:pong:received", (data: any) => {
      const time = new Date(data?.timestamp).toISOString();
      const latency = data?.latency || "?";
      this.info(
        `🏓 PONG получен [${time}] задержка: ${latency}ms`,
        LogCategory.EXCHANGE
      );
    });

    eventBus.on("exchange:pong:timeout", () => {
      this.warn("⚠️ PONG не получен в течение 30 секунд", LogCategory.EXCHANGE);
    });

    eventBus.on("exchange:subscribed", (data: any) => {
      this.info(
        `📡 Подписка на канал биржи: ${data?.channel}`,
        LogCategory.EXCHANGE
      );
    });

    eventBus.on("exchange:error", (data: any) => {
      this.error("❌ Ошибка биржи Gate.io", LogCategory.EXCHANGE, data);
    });

    // ==================== SYSTEM СОБЫТИЯ (канал system) ====================

    eventBus.on("system:startup", () => {
      this.success("🚀 Система запущена", LogCategory.SYSTEM);
    });

    eventBus.on("system:shutdown", () => {
      this.info("🛑 Система останавливается...", LogCategory.SYSTEM);
    });

    eventBus.on("system:ready", () => {
      this.success("✅ Система готова к работе", LogCategory.SYSTEM);
    });

    eventBus.on("system:error", (data: any) => {
      this.error("❌ Системная ошибка", LogCategory.SYSTEM, data);
    });

    // ==================== CLIENT СОБЫТИЯ (канал system) ====================

    eventBus.on("client:connected", (clientId: string) => {
      this.info(`👤 Клиент подключился: ${clientId}`, LogCategory.SYSTEM);
    });

    eventBus.on("client:disconnected", (clientId: string) => {
      this.info(`👤 Клиент отключился: ${clientId}`, LogCategory.SYSTEM);
    });

    // ==================== DATA СОБЫТИЯ (канал logs) ====================

    eventBus.on("data:orderbook:synced", (data: any) => {
      this.debug(
        `📖 Order Book синхронизирован: ${data?.symbol}`,
        LogCategory.INTERNAL
      );
    });

    // ==================== TRADING СОБЫТИЯ (канал logs) ====================

    eventBus.on("trading:order:created", (data: any) => {
      this.info(`📝 Ордер создан: ${data?.id}`, LogCategory.INTERNAL, data);
    });

    eventBus.on("trading:order:filled", (data: any) => {
      this.success(
        `✅ Ордер исполнен: ${data?.id}`,
        LogCategory.INTERNAL,
        data
      );
    });

    eventBus.on("trading:position:opened", (data: any) => {
      this.success(
        `🎯 Позиция открыта: ${data?.side} ${data?.symbol}`,
        LogCategory.INTERNAL,
        data
      );
    });

    eventBus.on("trading:position:closed", (data: any) => {
      const emoji = data?.pnl > 0 ? "💰" : "💸";
      this.success(
        `${emoji} Позиция закрыта: PnL ${data?.pnl}`,
        LogCategory.INTERNAL,
        data
      );
    });
  }

  /**
   * Проверка, нужно ли логировать сообщение данного уровня
   */
  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.config.level];
  }

  /**
   * Форматирование timestamp
   */
  private formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    const ms = String(date.getMilliseconds()).padStart(3, "0");

    return `${hours}:${minutes}:${seconds}.${ms}`;
  }

  /**
   * Форматирование сообщения для консоли (с цветами)
   */
  private formatConsoleMessage(logMsg: LogMessage): string {
    const time = this.formatTimestamp(logMsg.timestamp);
    const category = logMsg.category.toUpperCase().padEnd(8);

    // Цвета для уровней
    let levelStr = "";
    switch (logMsg.level) {
      case LogLevel.DEBUG:
        levelStr = chalk.gray(`[DEBUG]`);
        break;
      case LogLevel.INFO:
        levelStr = chalk.blue(`[INFO]`);
        break;
      case LogLevel.SUCCESS:
        levelStr = chalk.green(`[SUCCESS]`);
        break;
      case LogLevel.WARN:
        levelStr = chalk.yellow(`[WARN]`);
        break;
      case LogLevel.ERROR:
        levelStr = chalk.red(`[ERROR]`);
        break;
    }

    // Цвета для категорий
    let categoryStr = "";
    switch (logMsg.category) {
      case LogCategory.SYSTEM:
        categoryStr = chalk.cyan(`[${category}]`);
        break;
      case LogCategory.EXCHANGE:
        categoryStr = chalk.magenta(`[${category}]`);
        break;
      case LogCategory.INTERNAL:
        categoryStr = chalk.gray(`[${category}]`);
        break;
    }

    const timeStr = chalk.dim(`[${time}]`);

    return `${timeStr} ${levelStr} ${categoryStr} ${logMsg.message}`;
  }

  /**
   * Форматирование сообщения для файла (без цветов)
   */
  private formatFileMessage(logMsg: LogMessage): string {
    const time = new Date(logMsg.timestamp).toISOString();
    const level = logMsg.level.toUpperCase().padEnd(7);
    const category = logMsg.category.toUpperCase().padEnd(8);

    let msg = `[${time}] [${level}] [${category}] ${logMsg.message}`;

    if (logMsg.data) {
      msg += `\nData: ${JSON.stringify(logMsg.data, null, 2)}`;
    }

    return msg;
  }

  /**
   * Запись в файл
   */
  private writeToFile(logMsg: LogMessage): void {
    if (!this.config.toFile) return;

    try {
      const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      const filename = `dtrader-${date}.log`;
      const filepath = path.join(this.config.dir, filename);

      const message = this.formatFileMessage(logMsg) + "\n";

      fs.appendFileSync(filepath, message, "utf8");
    } catch (error) {
      console.error("❌ Ошибка записи в лог-файл:", error);
    }
  }

  /**
   * Создать директорию для логов
   */
  private ensureLogDir(): void {
    if (!fs.existsSync(this.config.dir)) {
      fs.mkdirSync(this.config.dir, { recursive: true });
    }
  }

  /**
   * Базовый метод логирования
   *
   * ✅ ВАЖНО: Маршрутизация по каналам WebSocket:
   * - LogCategory.SYSTEM → канал 'system'
   * - LogCategory.EXCHANGE → канал 'system'
   * - LogCategory.INTERNAL → канал 'logs'
   */
  private log(
    level: LogLevel,
    message: string,
    category: LogCategory,
    data?: any
  ): void {
    // Проверяем, нужно ли логировать
    if (!this.shouldLog(level)) {
      return;
    }

    const logMsg: LogMessage = {
      level,
      category,
      message,
      timestamp: Date.now(),
      data,
    };

    // Выводим в консоль
    console.log(this.formatConsoleMessage(logMsg));

    // Если есть data, выводим отдельно
    if (data && this.config.level === "debug") {
      console.log(chalk.dim(JSON.stringify(data, null, 2)));
    }

    // Записываем в файл
    this.writeToFile(logMsg);

    // ✅ ИСПРАВЛЕНО: Маршрутизация в каналы WebSocket
    // SYSTEM и EXCHANGE → канал 'system' (автоматическая подписка)
    // INTERNAL → канал 'logs' (требует подписки)

    if (category === LogCategory.SYSTEM || category === LogCategory.EXCHANGE) {
      // Эти логи идут в канал 'system'
      eventBus.emitSafe("client:broadcast", {
        channel: "system",
        message: {
          type: "log",
          level,
          message,
          source: "server",
          category,
          timestamp: logMsg.timestamp,
        },
      });
    } else if (category === LogCategory.INTERNAL) {
      // Эти логи идут в канал 'logs'
      eventBus.emitSafe("client:broadcast", {
        channel: "logs",
        message: {
          type: "log",
          level,
          message,
          source: "server",
          category,
          timestamp: logMsg.timestamp,
        },
      });
    }
  }

  /**
   * Уровень DEBUG
   */
  public debug(
    message: string,
    category: LogCategory = LogCategory.INTERNAL,
    data?: any
  ): void {
    this.log(LogLevel.DEBUG, message, category, data);
  }

  /**
   * Уровень INFO
   */
  public info(
    message: string,
    category: LogCategory = LogCategory.INTERNAL,
    data?: any
  ): void {
    this.log(LogLevel.INFO, message, category, data);
  }

  /**
   * Уровень SUCCESS
   */
  public success(
    message: string,
    category: LogCategory = LogCategory.INTERNAL,
    data?: any
  ): void {
    this.log(LogLevel.SUCCESS, message, category, data);
  }

  /**
   * Уровень WARN
   */
  public warn(
    message: string,
    category: LogCategory = LogCategory.INTERNAL,
    data?: any
  ): void {
    this.log(LogLevel.WARN, message, category, data);
  }

  /**
   * Уровень ERROR
   */
  public error(
    message: string,
    category: LogCategory = LogCategory.INTERNAL,
    data?: any
  ): void {
    this.log(LogLevel.ERROR, message, category, data);
  }
}

/**
 * Экспортируем единственный экземпляр Logger
 */
export const logger = Logger.getInstance();
