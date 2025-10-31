/**
 * @file src/config/constants.ts
 * @version 0
 * @description Константы приложения
 * @changelog
 *   0 - Первая версия (2025-01-22)
 */

/**
 * Константы Gate.io API
 */
export const GATEIO = {
  // REST API endpoints
  ENDPOINTS: {
    SPOT_ACCOUNTS: '/api/v4/spot/accounts',
    SPOT_TICKER: '/api/v4/spot/tickers',
    SPOT_ORDER_BOOK: '/api/v4/spot/order_book',
    SPOT_CANDLESTICKS: '/api/v4/spot/candlesticks',
    SPOT_ORDERS: '/api/v4/spot/orders',
  },
  
  // WebSocket каналы
  WS_CHANNELS: {
    TICKERS: 'spot.tickers',
    ORDER_BOOK: 'spot.order_book',
    ORDER_BOOK_UPDATE: 'spot.order_book_update',
    TRADES: 'spot.trades',
    CANDLESTICKS: 'spot.candlesticks',
  },
  
  // Таймауты
  TIMEOUTS: {
    REQUEST: 30000,           // 30 секунд на HTTP запрос
    CONNECT: 10000,           // 10 секунд на подключение
    PING_INTERVAL: 15000,     // 15 секунд между PING
    PONG_TIMEOUT: 30000,      // 30 секунд ожидание PONG
  },
  
  // Rate Limits
  RATE_LIMITS: {
    REST_PER_SECOND: 100,     // 100 запросов/сек
    WS_SUBSCRIPTIONS_MAX: 100, // Максимум подписок
  },
} as const;

/**
 * Константы индикаторов
 */
export const INDICATORS = {
  // Tick Speed Indicator
  TICK_SPEED: {
    WINDOW_SIZE: 60000,        // 60 секунд окно для расчёта
    UPDATE_INTERVAL: 20,       // Обновлять каждые 20 тиков
    
    // Уровни активности (тиков в минуту)
    LEVELS: {
      DEAD: 20,                // < 20 t/min
      LOW: 100,                // 20-100 t/min
      NORMAL: 300,             // 100-300 t/min
      HIGH: 600,               // 300-600 t/min
      EXTREME: Infinity,       // > 600 t/min
    },
    
    // Детекция всплесков
    SPIKE_MULTIPLIER: 2.0,     // Рост в 2 раза = всплеск
  },
  
  // Volume Confirmation Indicator
  VOLUME: {
    WINDOW_SIZE: 300000,       // 5 минут окно
    SPIKE_MULTIPLIER: 2.0,     // Рост в 2 раза = всплеск объёма
    MIN_VOLUME_RATIO: 1.5,     // Минимум 1.5x для подтверждения
  },
  
  // OrderBook Pressure Indicator
  ORDERBOOK_PRESSURE: {
    UPDATE_INTERVAL: 50,       // Обновлять каждые 50 обновлений стакана
    
    // Пороги для OBI (Order Book Imbalance)
    THRESHOLDS: {
      STRONG_SELL: -0.3,       // < -0.3 = сильное давление продаж
      SELL: -0.1,              // -0.3 to -0.1 = давление продаж
      NEUTRAL_LOW: -0.1,       // -0.1 to 0.1 = нейтрально
      NEUTRAL_HIGH: 0.1,
      BUY: 0.3,                // 0.1 to 0.3 = давление покупок
      STRONG_BUY: Infinity,    // > 0.3 = сильное давление покупок
    },
    
    // Детекция поглощения стен
    WALL_MIN_SIZE: 10000,      // $10k USDT минимум для "стены"
  },
  
  // EMA (Exponential Moving Average)
  EMA: {
    PERIODS: [9, 20, 50, 200], // Периоды для расчёта
    DEFAULT_PERIOD: 100,       // Для HTF анализа
  },
  
  // RSI (Relative Strength Index)
  RSI: {
    PERIOD: 14,                // Стандартный период
    OVERSOLD: 30,              // Уровень перепроданности
    OVERBOUGHT: 70,            // Уровень перекупленности
  },
} as const;

/**
 * Константы TVP Strategy
 */
export const TVP_STRATEGY = {
  // Таймфреймы
  TIMEFRAMES: {
    HTF: 24,                   // 24 минуты (Главнокомандующий)
    MTF: 6,                    // 6 минут (Генерал)
    LTF: 'ticks',              // Тики (Снайпер)
  },
  
  // HTF Analyzer
  HTF: {
    EMA_PERIOD: 100,           // EMA100 для определения тренда
    TREND_BUFFER: 0.02,        // 2% буфер для фильтрации флэта
  },
  
  // MTF Analyzer
  MTF: {
    LEVEL_LOOKBACK: 50,        // Смотрим 50 свечей назад для уровней
    BOUNCE_TOLERANCE: 0.01,    // 1% терпимость для отскока
    BREAKOUT_CONFIRMATION: 0.005, // 0.5% для подтверждения пробития
  },
  
  // LTF Analyzer
  LTF: {
    // Минимальные требования для входа
    MIN_TICK_ACTIVITY: 'HIGH', // HIGH или EXTREME
    MIN_VOLUME_RATIO: 2.0,     // Минимум 2x рост объёма
    MIN_PRESSURE_OBI: 0.1,     // Минимум 0.1 OBI
    
    // Confidence Score веса
    WEIGHTS: {
      TICK_SPEED: 0.33,
      VOLUME: 0.33,
      PRESSURE: 0.34,
    },
  },
  
  // Risk Management
  RISK: {
    MAX_POSITION_SIZE: 0.05,   // Максимум 5% депо на сделку
    BASE_POSITION_SIZE: 0.02,  // База 2% депо
    RISK_REWARD_RATIO: 3,      // R:R 1:3
    STOP_LOSS_BUFFER: 0.005,   // 0.5% ниже уровня
  },
} as const;

/**
 * Константы хранилищ данных
 */
export const STORAGE = {
  // TickStore
  TICK_STORE: {
    MAX_SIZE: 1000,            // Максимум 1000 тиков в памяти
  },
  
  // OrderBookStore
  ORDERBOOK_STORE: {
    MAX_DEPTH: 20,             // Максимум 20 уровней цен
    SYNC_INTERVAL: 3600000,    // Полная синхронизация каждый час
  },
  
  // CandleBuilder
  CANDLE_BUILDER: {
    BASE_INTERVAL: 60000,      // 1 минута базовый интервал
    MAX_CANDLES: 500,          // Максимум 500 свечей каждого типа
  },
} as const;

/**
 * Константы WebSocket Server (для клиентов)
 */
export const WS_SERVER = {
  // Каналы подписки
  CHANNELS: {
    SYSTEM: 'system',          // Автоматически для всех (обязательный)
    LOGS: 'logs',              // Логи
    TICKS: 'ticks',            // Тиковые данные
    ORDERBOOK: 'orderbook',    // OrderBook
    BALANCE: 'balance',        // Балансы
    INDICATORS: 'indicators',  // Индикаторы
    SIGNALS: 'signals',        // Торговые сигналы
    POSITIONS: 'positions',    // Позиции
  },
  
  // Таймауты
  PING_INTERVAL: 30000,        // 30 секунд между PING от клиента
  PONG_TIMEOUT: 60000,         // 60 секунд ожидание PONG от клиента
  
  // Лимиты
  MAX_MESSAGE_SIZE: 1048576,   // 1MB максимальный размер сообщения
} as const;

/**
 * Цвета для логирования (chalk)
 */
export const COLORS = {
  RESET: '\x1b[0m',
  BRIGHT: '\x1b[1m',
  DIM: '\x1b[2m',
  
  // Цвета текста
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  MAGENTA: '\x1b[35m',
  CYAN: '\x1b[36m',
  WHITE: '\x1b[37m',
  GRAY: '\x1b[90m',
  
  // Фоны
  BG_RED: '\x1b[41m',
  BG_GREEN: '\x1b[42m',
  BG_YELLOW: '\x1b[43m',
  BG_BLUE: '\x1b[44m',
} as const;

/**
 * Эмодзи для логов
 */
export const EMOJI = {
  // Статусы
  SUCCESS: '✅',
  ERROR: '❌',
  WARNING: '⚠️',
  INFO: 'ℹ️',
  DEBUG: '🐛',
  
  // Биржа
  EXCHANGE: '💱',
  CONNECTED: '🔗',
  DISCONNECTED: '🔌',
  PING: '🏓',
  
  // Торговля
  MONEY: '💰',
  CHART: '📈',
  CHART_DOWN: '📉',
  SIGNAL: '📡',
  ROCKET: '🚀',
  FIRE: '🔥',
  TARGET: '🎯',
  SNIPER: '🎯',
  
  // Данные
  DATABASE: '💾',
  CLOCK: '⏰',
  HOURGLASS: '⌛',
  PACKAGE: '📦',
  
  // Клиенты
  CLIENT: '👤',
  CLIENTS: '👥',
  MESSAGE: '📨',
  BROADCAST: '📢',
} as const;

/**
 * Версия приложения
 */
export const APP_VERSION = '1.0.1';

/**
 * Название приложения
 */
export const APP_NAME = 'dtrader-server (TVP Sniper)';