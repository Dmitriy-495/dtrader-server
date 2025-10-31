# dtrader-crypto-2.0

Консольный торговый бот на бирже Gate.io с архитектурой client-server.

**Стек:** Node.js + TypeScript + WebSocket + SQLite

**Версия:** 1.0.1 (Data Layer)

---

## 📋 Архитектура проекта

Приложение состоит из двух частей:

### 1. 🖥️ Серверная часть (VPS)

Работает в режиме демона и выполняет:

- Подключение к бирже Gate.io (REST API + WebSocket)
- Получение и накопление торговых данных в реальном времени
- Анализ данных, расчёт индикаторов по стратегии TVP Sniper
- Генерация торговых сигналов и управление позициями
- Трансляция данных клиентам через WebSocket Server

### 2. 🖥️ Клиентская часть (локальные ПК)

Использует `terminal-kit` для визуализации:

- Подключение к серверу (REST API + WebSocket)
- Приём real-time данных и отображение в терминале
- Отправка команд управления сервером
- Мониторинг индикаторов, балансов, позиций

---

## ✅ Что уже реализовано

### 🔌 Exchange Layer (Gate.io API)

- ✅ **GateioClient** - REST API клиент

  - Получение баланса (`/api/v4/spot/accounts`)
  - Получение тикеров (`/api/v4/spot/tickers`)
  - Получение orderbook (`/api/v4/spot/order_book`)
  - Получение свечей (`/api/v4/spot/candlesticks`)
  - Автоматическая подпись запросов (HMAC-SHA512)

- ✅ **GateioWebSocket** - WebSocket клиент
  - Подключение к `wss://api.gateio.ws/ws/v4/`
  - Подписка на каналы `spot.tickers` и `spot.order_book_update`
  - Native WebSocket ping-pong механизм
  - Автоматическое переподключение при потере связи
  - Эмит событий через EventBus

### 💾 Data Layer

- ✅ **TickStore** - circular buffer для хранения тиков

  - Последние 1000 тиков в памяти
  - Быстрый доступ к данным (getLast, getLastN, getForPeriod)
  - Расчёт статистики (средняя/мин/макс цена, объём)

- ✅ **OrderBookStore** - синхронизация Order Book
  - Полная синхронизация через REST API
  - Инкрементальные обновления через WebSocket
  - Автоматическая ресинхронизация каждый час
  - Расчёт статистики стакана (спред, объёмы, давление)

### 🎯 Core Infrastructure

- ✅ **EventBus** - централизованная шина событий

  - Singleton pattern
  - Типизированные события (exchange, data, indicator, trading, system)
  - Разделение критичной и некритичной логики
  - Статистика эмитов и ошибок

- ✅ **Logger** - система логирования

  - Уровни: debug, info, success, warn, error
  - Категории: system, exchange, internal
  - Цветной вывод в консоль (chalk)
  - Опциональная запись в файл
  - Автологирование событий из EventBus
  - Маршрутизация в каналы WebSocket (system/logs)

- ✅ **Config Management** - управление конфигурацией
  - Загрузка из `.env` через dotenv
  - Валидация всех параметров
  - Типизированный объект конфигурации
  - Поддержка production/development/testnet режимов

### 🗄️ State Management

- ✅ **BalanceStore** - текущий баланс
- ✅ **PositionStore** - открытые позиции
- ✅ **IndicatorStore** - последние значения индикаторов
- ✅ **MarketStore** - состояние рынка (цена, объём, orderbook stats)

---

## 🚧 Текущий этап разработки

### Проблема: Нет данных от Gate.io WebSocket

**Симптомы:**

- ✅ Подключение к WebSocket успешное
- ✅ Подписка на каналы подтверждена
- ✅ Ping-pong работает (задержка ~500-1000ms)
- ❌ **Тики не приходят** (нет событий `data:tick:received`)
- ❌ **OrderBook updates не приходят** (нет событий `data:orderbook:updated`)

**Что сделано для отладки:**

1. ✅ Исправлена обработка массивов данных в `handleChannelData()`
2. ✅ Добавлено детальное логирование всех WebSocket сообщений
3. 🔄 Необходимо включить `LOG_LEVEL=debug` для диагностики

**Возможные причины:**

- Неправильный формат подписки (payload для orderbook: `["ETH_USDT", "100ms"]`)
- Gate.io v4 API может требовать другой формат
- Низкая активность на паре (маловероятно для ETH_USDT)

**План действий:**

1. Включить debug логи и проверить все входящие сообщения
2. Проверить документацию Gate.io WebSocket v4 API
3. Попробовать альтернативные форматы подписки
4. Рассмотреть использование `spot.order_book` вместо `spot.order_book_update`

---

## 📝 План дальнейшей реализации

### Этап 1: Завершение Data Layer (приоритет)

- [ ] **Исправить получение данных от Gate.io WebSocket**
- [ ] **CandleBuilder** - построение свечей из тиков
  - Агрегация тиков в свечи (1m, 5m, 15m, 1h, 4h)
  - Буфер последних 500 свечей каждого таймфрейма
  - События формирования новых свечей

### Этап 2: Indicators Layer

- [ ] **TickSpeedIndicator** - скорость тиков (активность рынка)

  - Расчёт тиков в минуту (скользящее окно 60 сек)
  - Уровни активности: DEAD/LOW/NORMAL/HIGH/EXTREME
  - Детекция всплесков (spike detection)
  - Тренд скорости (rising/falling/stable)

- [ ] **VolumeConfirmationIndicator** - подтверждение объёмом

  - Скользящее окно 5 минут
  - Детекция всплесков объёма (2x от среднего)
  - Подтверждение движения (min ratio 1.5x)

- [ ] **OrderBookPressureIndicator** - давление в стакане

  - Order Book Imbalance (OBI): `(bid - ask) / (bid + ask)`
  - Направление давления: STRONG_SELL/SELL/NEUTRAL/BUY/STRONG_BUY
  - Детекция "стен" (большие объёмы > $10k)
  - Спред и spread percent

- [ ] **EMA** - экспоненциальная скользящая средняя

  - Периоды: 9, 20, 50, 200
  - Расчёт на свечах (разные таймфреймы)
  - Определение тренда (up/down/flat)

- [ ] **RSI** - индекс относительной силы
  - Период 14
  - Зоны: oversold (<30), neutral (30-70), overbought (>70)

### Этап 3: TVP Sniper Strategy

- [ ] **HTF Analyzer** (Главнокомандующий, 24 минуты)

  - EMA100 для определения глобального тренда
  - Фильтр флэта (2% буфер)
  - Разрешение торговли только по тренду

- [ ] **MTF Analyzer** (Генерал, 6 минут)

  - Поиск ключевых уровней (последние 50 свечей)
  - Детекция отскоков от уровней (1% tolerance)
  - Детекция пробитий уровней (0.5% confirmation)
  - Генерация сигналов для LTF

- [ ] **LTF Analyzer** (Снайпер, тики)
  - Подтверждение входа через индикаторы:
    - TickSpeed >= HIGH
    - Volume spike >= 2x
    - OrderBook Pressure OBI >= 0.1
  - Confidence Score (взвешенная сумма)
  - Финальное решение о входе

### Этап 4: Trading Layer

- [ ] **RiskManager** - управление рисками

  - Расчёт размера позиции (2-5% депо)
  - Расчёт Stop Loss и Take Profit
  - Risk:Reward ratio контроль (1:3)

- [ ] **OrderManager** - управление ордерами

  - Создание ордеров через Gate.io API
  - Отслеживание статуса ордеров
  - Отмена и модификация ордеров

- [ ] **PositionManager** - управление позициями
  - Открытие/закрытие позиций
  - Трейлинг стоп
  - Расчёт PnL в реальном времени

### Этап 5: WebSocket Server (для клиентов)

- [ ] **ClientManager** - управление подключениями

  - Уникальные ID для клиентов
  - Отслеживание активных соединений
  - Graceful disconnect

- [ ] **ChannelManager** - управление подписками

  - Каналы: system (авто), logs, ticks, orderbook, balance, indicators, signals, positions
  - Subscribe/Unsubscribe механизм
  - Broadcast по каналам

- [ ] **WebSocketServer** - сервер для клиентов
  - Порт 8080 (настраивается)
  - Ping-pong с клиентами
  - Отправка snapshot состояния новым клиентам
  - Трансляция событий от EventBus

### Этап 6: Database Layer (SQLite)

- [ ] **Schema** - структура БД

  - Таблицы: ticks, candles, orderbook_pressure, signals, positions, trades
  - Индексы для быстрого поиска
  - Auto-cleanup старых данных (retention policy)

- [ ] **DatabaseManager** - работа с БД
  - Connection pool
  - Подписка на события для автосохранения
  - Batch inserts для производительности
  - Queries для аналитики

### Этап 7: Client Application (Terminal UI)

- [ ] **Базовый клиент** (terminal-kit)

  - Подключение к серверу
  - Подписка на нужные каналы
  - Вывод логов и данных

- [ ] **Dashboard** - дашборд с индикаторами

  - Real-time графики (ASCII charts)
  - Состояние индикаторов
  - Баланс и открытые позиции
  - Последние сигналы

- [ ] **Commands** - команды управления
  - Старт/стоп торговли
  - Изменение настроек стратегии
  - Ручное открытие/закрытие позиций
  - Экспорт логов и статистики

---

## 🚀 Быстрый старт

### Установка

```bash
# Клонирование репозитория
git clone <repository-url>
cd dtrader-server

# Установка зависимостей
npm install

# Создание .env файла
cp .env.example .env
```

### Настройка .env

```env
# Gate.io API credentials (обязательно!)
GATE_API_KEY=your_api_key_here
GATE_API_SECRET=your_api_secret_here

# Торговая пара
SYMBOL=ETH_USDT

# Режим работы
MODE=development

# Уровень логирования (для отладки используйте debug)
LOG_LEVEL=info
```

Получить API ключи: https://www.gate.io/myaccount/apiv4keys

### Запуск

```bash
# Режим разработки (с автоперезагрузкой)
npm run dev

# Режим разработки (с watch)
npm run dev:watch

# Production сборка
npm run build
npm start

# PM2 (для VPS)
npm run pm2:start
npm run pm2:logs
npm run pm2:stop
```

---

## 📊 Текущая функциональность

### ✅ Что работает сейчас:

```bash
npm run dev
```

1. **Загрузка конфигурации** из `.env`
2. **Подключение к Gate.io REST API**
   - Получение баланса
   - Получение текущей цены ETH_USDT
3. **Инициализация Data Stores**
   - TickStore (готов принимать тики)
   - OrderBookStore (синхронизирован через REST)
4. **Подключение к Gate.io WebSocket**
   - Соединение установлено
   - Подписка на каналы подтверждена
   - Ping-pong работает
5. **EventBus + Logger** - все события логируются

### ⚠️ Что НЕ работает (в отладке):

- **Real-time данные от биржи** (тики и orderbook updates не приходят)

---

## 🛠️ Структура проекта

```
dtrader-crypto-2.0/
├── src/
│   ├── config/               # Конфигурация
│   │   ├── constants.ts      # Константы приложения
│   │   └── env.ts            # Загрузка .env
│   │
│   ├── core/                 # Ядро системы
│   │   ├── EventBus.ts       # ✅ Шина событий
│   │   └── types.ts          # Типы событий
│   │
│   ├── exchange/             # Интеграция с Gate.io
│   │   ├── GateioClient.ts   # ✅ REST API клиент
│   │   ├── GateioWebSocket.ts # ✅ WebSocket клиент (в отладке)
│   │   ├── types.ts          # Типы Gate.io API
│   │   └── utils.ts          # Утилиты (подпись запросов)
│   │
│   ├── data/                 # Data Layer
│   │   ├── TickStore.ts      # ✅ Хранилище тиков
│   │   ├── OrderBookStore.ts # ✅ Хранилище Order Book
│   │   └── types.ts          # Типы данных
│   │
│   ├── state/                # State Management
│   │   ├── stores/
│   │   │   ├── BalanceStore.ts    # ✅ Баланс
│   │   │   ├── PositionStore.ts   # ✅ Позиции
│   │   │   ├── IndicatorStore.ts  # ✅ Индикаторы
│   │   │   └── MarketStore.ts     # ✅ Рынок
│   │   └── types.ts          # Типы состояний
│   │
│   ├── logger/               # Логирование
│   │   ├── Logger.ts         # ✅ Централизованный логгер
│   │   └── types.ts          # Типы логов
│   │
│   ├── indicators/           # 🚧 Индикаторы
│   │   ├── TickSpeedIndicator.ts
│   │   ├── VolumeConfirmationIndicator.ts
│   │   ├── OrderBookPressureIndicator.ts
│   │   ├── EMA.ts
│   │   └── RSI.ts
│   │
│   ├── strategies/           # 🚧 Торговые стратегии
│   │   ├── BaseStrategy.ts
│   │   └── TVP/
│   │       ├── TVPStrategy.ts
│   │       └── tvp-strategy-setting.json
│   │
│   ├── trading/              # 🚧 Торговля
│   │   ├── OrderManager.ts
│   │   ├── PositionManager.ts
│   │   └── RiskManager.ts
│   │
│   ├── server/               # 🚧 WebSocket Server (клиенты)
│   │   ├── WebSocketServer.ts
│   │   ├── ClientManager.ts
│   │   ├── ChannelManager.ts
│   │   └── types.ts
│   │
│   ├── utils/                # Утилиты
│   │   ├── helpers.ts
│   │   └── validators.ts
│   │
│   └── index.ts              # ✅ Точка входа
│
├── .env.example              # Пример конфигурации
├── package.json              # Зависимости
├── tsconfig.json             # TypeScript конфиг
├── nodemon.json              # Nodemon конфиг
├── .gitignore
├── .editorconfig
├── README.md                 # Этот файл
└── CLIENT_API.md             # API для клиентской части
```

---

## 📚 Документация

- **[CLIENT_API.md](./CLIENT_API.md)** - WebSocket API для клиентов
  - Форматы сообщений
  - Каналы подписки
  - Примеры использования

---

## 🔧 Технологии

- **Node.js** 20+ - runtime
- **TypeScript** 5.7 - типизация
- **ws** 8.18 - WebSocket клиент/сервер
- **axios** 1.7 - HTTP клиент
- **dotenv** 16.4 - управление конфигурацией
- **chalk** 4.1 - цветной вывод в консоль
- **better-sqlite3** 11.7 - база данных (планируется)
- **terminal-kit** - клиентский UI (планируется)
- **pm2** 5.4 - process manager для VPS

---

## ⚙️ Конфигурация

Все настройки в `.env` файле:

```env
# Gate.io API
GATE_API_KEY=your_key
GATE_API_SECRET=your_secret
GATE_API_URL=https://api.gateio.ws
GATE_WS_URL=wss://api.gateio.ws/ws/v4/

# Торговля
SYMBOL=ETH_USDT
ORDERBOOK_DEPTH=20

# WebSocket Server
WS_SERVER_PORT=8080

# База данных
DB_PATH=./dtrader.db
DB_ORDERBOOK_PRESSURE_INTERVAL=10
DB_RETENTION_DAYS=90

# Режим работы
MODE=development              # production | development | testnet
LOG_LEVEL=info                # debug | info | warn | error
LOG_TO_FILE=false
LOG_DIR=./logs

# Event Bus
EVENT_BUS_MAX_LISTENERS=100

# Таймфреймы TVP Strategy
HTF_TIMEFRAME=24              # Высший (минуты)
MTF_TIMEFRAME=6               # Средний (минуты)
LTF_TIMEFRAME=ticks           # Младший (тики)
```

---

## 🐛 Известные проблемы

### 1. ❌ Нет данных от Gate.io WebSocket

**Статус:** В отладке

**Симптомы:**

- Подключение успешное
- Подписка подтверждена
- Ping-pong работает
- Но тики и orderbook updates не приходят

**Временное решение:**

- Включить `LOG_LEVEL=debug` в `.env`
- Проверить логи на наличие сообщений от биржи
- Возможно потребуется корректировка формата подписки

---

## 📞 Поддержка

Проект разрабатывается для личного использования.

**Автор:** [Ваше имя]  
**Версия:** 1.0.1 (Data Layer)  
**Последнее обновление:** 2025-01-22

---

## 📜 Лицензия

ISC License

---

## 🎯 Цели проекта

1. ✅ **Стабильное подключение к Gate.io** (REST + WebSocket)
2. 🚧 **Real-time обработка данных** (тики, orderbook, свечи)
3. ⏳ **Реализация TVP Sniper Strategy** (HTF/MTF/LTF)
4. ⏳ **Автоматическая торговля** с risk management
5. ⏳ **Клиентское приложение** для мониторинга
6. ⏳ **База данных** для истории и аналитики

**Текущий фокус:** Отладка получения real-time данных от Gate.io WebSocket

---

## 🚀 Следующие шаги

1. **URGENT:** Исправить получение данных от Gate.io WebSocket
2. Реализовать CandleBuilder для построения свечей
3. Реализовать базовые индикаторы (TickSpeed, OrderBookPressure)
4. Начать разработку TVP Strategy (HTF Analyzer)

---

**Happy Trading!** 💰📈🚀
