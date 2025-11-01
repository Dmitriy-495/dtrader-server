import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config();

export interface AppConfig {
  gateio: {
    apiKey: string;
    apiSecret: string;
    apiUrl: string;
    wsUrl: string;
  };
  trading: {
    symbols: string[]; // 🆕 Массив символов
    market: "spot" | "futures"; // 🆕 Тип рынка
    leverage: number; // 🆕 Плечо
    orderBookDepth: number;
  };
  server: {
    wsPort: number;
  };
  database: {
    path: string;
    orderBookPressureInterval: number;
    retentionDays: number;
  };
  mode: "production" | "development" | "testnet";
  logging: {
    level: "debug" | "info" | "warn" | "error";
    toFile: boolean;
    dir: string;
  };
  eventBus: {
    maxListeners: number;
  };
  timeframes: {
    htf: number;
    mtf: number;
    ltf: string;
  };
}

export function loadConfig(): AppConfig {
  // Парсим символы
  const symbolsString = process.env.TRADING_SYMBOLS || "BTC_USDT";
  const symbols = symbolsString.split(",").map((s) => s.trim());

  // Валидация символов
  symbols.forEach((symbol) => {
    if (!symbol.includes("_")) {
      throw new Error(
        `Invalid symbol format: ${symbol}. Expected format: BASE_QUOTE`
      );
    }
  });

  const config: AppConfig = {
    gateio: {
      apiKey: process.env.GATE_API_KEY || "",
      apiSecret: process.env.GATE_API_SECRET || "",
      apiUrl: process.env.GATE_API_URL || "https://api.gateio.ws",
      wsUrl: process.env.GATE_WS_URL || "wss://fx-ws.gateio.ws/v4/ws/usdt",
    },
    trading: {
      symbols,
      market: (process.env.TRADING_MARKET as "spot" | "futures") || "futures",
      leverage: parseInt(process.env.TRADING_LEVERAGE || "10"),
      orderBookDepth: parseInt(process.env.TRADING_ORDERBOOK_DEPTH || "20"),
    },
    server: {
      wsPort: parseInt(process.env.WS_SERVER_PORT || "8080"),
    },
    database: {
      path: process.env.DB_PATH || "./dtrader.db",
      orderBookPressureInterval: parseInt(
        process.env.DB_ORDERBOOK_PRESSURE_INTERVAL || "50"
      ),
      retentionDays: parseInt(process.env.DB_RETENTION_DAYS || "30"),
    },
    mode:
      (process.env.APP_MODE as "production" | "development" | "testnet") ||
      "development",
    logging: {
      level:
        (process.env.LOG_LEVEL as "debug" | "info" | "warn" | "error") ||
        "info",
      toFile: process.env.LOG_TO_FILE === "true",
      dir: process.env.LOG_DIR || "./logs",
    },
    eventBus: {
      maxListeners: parseInt(process.env.EVENTBUS_MAX_LISTENERS || "100"),
    },
    timeframes: {
      htf: parseInt(process.env.TIMEFRAME_HTF || "24"),
      mtf: parseInt(process.env.TIMEFRAME_MTF || "6"),
      ltf: process.env.TIMEFRAME_LTF || "ticks",
    },
  };

  // Валидация
  validateConfig(config);

  // Вывод конфигурации
  console.log("📋 Загрузка конфигурации...");
  console.log("✅ Конфигурация валидна!");
  console.log(`📊 Режим работы: ${config.mode.toUpperCase()}`);
  console.log(`💱 Торговые пары: ${config.trading.symbols.join(", ")}`);
  console.log(`🎯 Рынок: ${config.trading.market.toUpperCase()}`);
  console.log(`⚡ Плечо: ${config.trading.leverage}x`);
  console.log(`🔧 WebSocket Server: порт ${config.server.wsPort}`);
  console.log(
    `📈 Таймфреймы: HTF ${config.timeframes.htf}m | MTF ${config.timeframes.mtf}m | LTF ${config.timeframes.ltf}`
  );
  console.log(`💾 База данных: ${config.database.path}`);
  console.log(
    `📝 Уровень логирования: ${config.logging.level.toUpperCase()}\n`
  );

  return config;
}

function validateConfig(config: AppConfig): void {
  // API ключи
  if (!config.gateio.apiKey || config.gateio.apiKey === "your_api_key_here") {
    throw new Error("GATE_API_KEY не установлен в .env");
  }

  if (
    !config.gateio.apiSecret ||
    config.gateio.apiSecret === "your_api_secret_here"
  ) {
    throw new Error("GATE_API_SECRET не установлен в .env");
  }

  // Символы
  if (config.trading.symbols.length === 0) {
    throw new Error("Не указаны торговые пары в TRADING_SYMBOLS");
  }

  // Плечо
  if (config.trading.market === "futures") {
    if (config.trading.leverage < 1 || config.trading.leverage > 125) {
      throw new Error("Плечо должно быть от 1 до 125");
    }
  }

  // Режим
  if (!["production", "development", "testnet"].includes(config.mode)) {
    throw new Error(
      "APP_MODE должен быть: production, development или testnet"
    );
  }

  // Уровень логирования
  if (!["debug", "info", "warn", "error"].includes(config.logging.level)) {
    throw new Error("LOG_LEVEL должен быть: debug, info, warn или error");
  }
}

export const config = loadConfig();
