/**
 * @file src/config/env.ts
 * @version 0
 * @description Загрузка и валидация переменных окружения
 * @changelog
 *   0 - Первая версия (2025-01-22)
 */

import * as dotenv from "dotenv";
import * as path from "path";

// Загружаем переменные окружения из .env файла
dotenv.config();

/**
 * Интерфейс конфигурации приложения
 */
interface AppConfig {
  // Gate.io API
  gateio: {
    apiKey: string;
    apiSecret: string;
    apiUrl: string;
    wsUrl: string;
  };

  // Торговые настройки
  trading: {
    symbol: string;
    orderBookDepth: number;
  };

  // WebSocket Server
  server: {
    wsPort: number;
  };

  // База данных
  database: {
    path: string;
    orderBookPressureInterval: number;
    retentionDays: number;
  };

  // Режим работы
  mode: "production" | "development" | "testnet";

  // Логирование
  logging: {
    level: "debug" | "info" | "warn" | "error";
    toFile: boolean;
    dir: string;
  };

  // Event Bus
  eventBus: {
    maxListeners: number;
  };

  // Timeframes (для TVP Strategy)
  timeframes: {
    htf: number; // Высший таймфрейм (минуты)
    mtf: number; // Средний таймфрейм (минуты)
    ltf: string; // Младший таймфрейм (ticks)
  };
}

/**
 * Получить значение переменной окружения или выбросить ошибку
 *
 * @param key - название переменной
 * @param defaultValue - значение по умолчанию (опционально)
 * @returns значение переменной
 * @throws {Error} если переменная не найдена и нет значения по умолчанию
 */
function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;

  if (value === undefined) {
    throw new Error(
      `❌ Переменная окружения ${key} не найдена! Проверьте .env файл.`
    );
  }

  return value;
}

/**
 * Получить числовое значение переменной окружения
 *
 * @param key - название переменной
 * @param defaultValue - значение по умолчанию
 * @returns числовое значение
 */
function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];

  if (value === undefined) {
    return defaultValue;
  }

  const parsed = parseInt(value, 10);

  if (isNaN(parsed)) {
    throw new Error(
      `❌ Переменная окружения ${key} должна быть числом! Получено: ${value}`
    );
  }

  return parsed;
}

/**
 * Получить булево значение переменной окружения
 *
 * @param key - название переменной
 * @param defaultValue - значение по умолчанию
 * @returns булево значение
 */
function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];

  if (value === undefined) {
    return defaultValue;
  }

  return value.toLowerCase() === "true";
}

/**
 * Валидация конфигурации
 *
 * @param config - объект конфигурации
 * @throws {Error} если конфигурация некорректна
 */
function validateConfig(config: AppConfig): void {
  // Проверяем API ключи
  if (config.gateio.apiKey === "your_api_key_here") {
    throw new Error(
      "❌ GATE_API_KEY не настроен! Получите ключи на https://www.gate.io/myaccount/apiv4keys"
    );
  }

  if (config.gateio.apiSecret === "your_api_secret_here") {
    throw new Error(
      "❌ GATE_API_SECRET не настроен! Получите ключи на https://www.gate.io/myaccount/apiv4keys"
    );
  }

  // Проверяем торговую пару
  if (!config.trading.symbol || config.trading.symbol.length < 3) {
    throw new Error("❌ SYMBOL некорректен! Пример: ETH_USDT");
  }

  // Проверяем режим работы
  const validModes = ["production", "development", "testnet"];
  if (!validModes.includes(config.mode)) {
    throw new Error(`❌ MODE должен быть одним из: ${validModes.join(", ")}`);
  }

  // Проверяем уровень логирования
  const validLogLevels = ["debug", "info", "warn", "error"];
  if (!validLogLevels.includes(config.logging.level)) {
    throw new Error(
      `❌ LOG_LEVEL должен быть одним из: ${validLogLevels.join(", ")}`
    );
  }

  // Проверяем таймфреймы
  if (config.timeframes.htf <= config.timeframes.mtf) {
    throw new Error("❌ HTF_TIMEFRAME должен быть больше MTF_TIMEFRAME!");
  }

  console.log("✅ Конфигурация валидна!");
}

/**
 * Загрузка и валидация конфигурации приложения
 *
 * @returns объект конфигурации
 */
export function loadConfig(): AppConfig {
  console.log("📋 Загрузка конфигурации...");

  const config: AppConfig = {
    // Gate.io API
    gateio: {
      apiKey: getEnvVar("GATE_API_KEY"),
      apiSecret: getEnvVar("GATE_API_SECRET"),
      apiUrl: getEnvVar("GATE_API_URL", "https://api.gateio.ws"),
      wsUrl: getEnvVar("GATE_WS_URL", "wss://api.gateio.ws/ws/v4/"),
    },

    // Торговые настройки
    trading: {
      symbol: getEnvVar("SYMBOL", "ETH_USDT"),
      orderBookDepth: getEnvNumber("ORDERBOOK_DEPTH", 20),
    },

    // WebSocket Server
    server: {
      wsPort: getEnvNumber("WS_SERVER_PORT", 8080),
    },

    // База данных
    database: {
      path: getEnvVar("DB_PATH", "./dtrader.db"),
      orderBookPressureInterval: getEnvNumber(
        "DB_ORDERBOOK_PRESSURE_INTERVAL",
        10
      ),
      retentionDays: getEnvNumber("DB_RETENTION_DAYS", 90),
    },

    // Режим работы
    mode: getEnvVar("MODE", "development") as
      | "production"
      | "development"
      | "testnet",

    // Логирование
    logging: {
      level: getEnvVar("LOG_LEVEL", "info") as
        | "debug"
        | "info"
        | "warn"
        | "error",
      toFile: getEnvBoolean("LOG_TO_FILE", false),
      dir: getEnvVar("LOG_DIR", "./logs"),
    },

    // Event Bus
    eventBus: {
      maxListeners: getEnvNumber("EVENT_BUS_MAX_LISTENERS", 100),
    },

    // Timeframes
    timeframes: {
      htf: getEnvNumber("HTF_TIMEFRAME", 24),
      mtf: getEnvNumber("MTF_TIMEFRAME", 6),
      ltf: getEnvVar("LTF_TIMEFRAME", "ticks"),
    },
  };

  // Валидация конфигурации
  validateConfig(config);

  // Выводим информацию о конфигурации
  console.log(`📊 Режим работы: ${config.mode.toUpperCase()}`);
  console.log(`💱 Торговая пара: ${config.trading.symbol}`);
  console.log(`🔧 WebSocket Server: порт ${config.server.wsPort}`);
  console.log(
    `📈 Таймфреймы: HTF ${config.timeframes.htf}m | MTF ${config.timeframes.mtf}m | LTF ${config.timeframes.ltf}`
  );
  console.log(`💾 База данных: ${config.database.path}`);
  console.log(`📝 Уровень логирования: ${config.logging.level.toUpperCase()}`);
  console.log("");

  return config;
}

/**
 * Экспортируем загруженную конфигурацию
 */
export const config = loadConfig();