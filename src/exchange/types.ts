/**
 * @file src/exchange/types.ts
 * @version 0
 * @description Типы данных для Gate.io API
 * @changelog
 *   0 - Первая версия (2025-01-22)
 */

// ============================================================================
// FUTURES TYPES
// ============================================================================

/**
 * Контракт фьючерса
 */
export interface FuturesContract {
  name: string; // BTC_USDT
  type: string; // direct, inverse
  quanto_multiplier: string; // Quanto Multiplier
  leverage_min: string; // Минимальное плечо
  leverage_max: string; // Максимальное плечо (125)
  maintenance_rate: string; // Maintenance margin rate
  mark_type: string; // index, last
  last_price: string; // Последняя цена
  mark_price: string; // Mark price
  index_price: string; // Index price
  funding_rate_indicative: string; // Предсказанный funding rate
  mark_price_round: string; // Mark price rounding
  funding_offset: number; // Funding offset
  in_delisting: boolean; // В процессе делистинга
  risk_limit_base: string; // Risk limit base
  interest_rate: string; // Interest rate
  order_price_round: string; // Order price rounding
  order_size_min: number; // Минимальный размер ордера
  order_size_max: number; // Максимальный размер ордера
  order_price_deviate: string; // Order price deviation
  ref_discount_rate: string; // Referral discount rate
  ref_rebate_rate: string; // Referral rebate rate
  orderbook_id: number; // Order book ID
  trade_id: number; // Trade ID
  trade_size: number; // Trade size
  position_size: number; // Position size
  config_change_time: number; // Config change time
  in_tradable: boolean; // Доступен для торговли
}

/**
 * Аккаунт фьючерсов
 */
export interface FuturesAccount {
  total: string; // Общий баланс
  unrealised_pnl: string; // Нереализованная прибыль/убыток
  position_margin: string; // Маржа позиций
  order_margin: string; // Маржа ордеров
  available: string; // Доступные средства
  point: string; // Point card balance
  currency: string; // USDT, BTC
  in_dual_mode: boolean; // Режим dual mode
  enable_credit: boolean; // Credit enabled
  position_initial_margin: string;
  maintenance_margin: string;
  bonus: string;
  history: {
    dnw: string; // Deposit and withdrawal
    pnl: string; // Profit and loss
    fee: string; // Trading fees
    refr: string; // Referrer rebates
    fund: string; // Funding fees
    point_dnw: string;
    point_fee: string;
    point_refr: string;
    bonus_offset: string;
  };
}

/**
 * Позиция фьючерса
 */
export interface FuturesPosition {
  user: number; // User ID
  contract: string; // BTC_USDT
  size: number; // Position size (положительный = long, отрицательный = short)
  leverage: string; // Плечо
  risk_limit: string; // Risk limit
  leverage_max: string; // Максимальное плечо
  maintenance_rate: string;
  value: string; // Position value
  margin: string; // Position margin
  entry_price: string; // Средняя цена входа
  liq_price: string; // Liquidation price
  mark_price: string; // Mark price
  initial_margin: string; // Initial margin
  realised_pnl: string; // Реализованная прибыль
  unrealised_pnl: string; // Нереализованная прибыль
  pnl_pnl: string; // Profit and loss PnL
  pnl_fund: string; // Funding PnL
  pnl_fee: string; // Fee PnL
  history_pnl: string; // History PnL
  last_close_pnl: string; // Last close PnL
  realised_point: string; // Realised point
  history_point: string; // History point
  adl_ranking: number; // ADL ranking (1-5)
  pending_orders: number; // Pending orders
  close_order: {
    id: number;
    price: string;
    is_liq: boolean;
  } | null;
  mode: string; // single, dual_long, dual_short
  cross_leverage_limit: string;
  update_time: number; // Update timestamp
  update_id: number; // Update ID
}

/**
 * Ордер фьючерса
 */
export interface FuturesOrder {
  id: number; // Order ID
  user: number; // User ID
  contract: string; // BTC_USDT
  create_time: number; // Create time
  finish_time: number; // Finish time
  finish_as: string; // filled, cancelled, liquidated, ioc, auto_deleveraged, reduce_only, position_closed
  status: string; // open, finished
  iceberg: number; // Iceberg amount
  size: number; // Order size
  price: string; // Order price
  fill_price: string; // Fill price
  left: number; // Size left to fill
  text: string; // User defined text
  tkfr: string; // Taker fee rate
  mkfr: string; // Maker fee rate
  refu: number; // Reference user ID
  is_reduce_only: boolean; // Reduce only
  is_close: boolean; // Close position
  is_liq: boolean; // Liquidation order
  tif: string; // Time in force (gtc, ioc, poc)
  auto_size: string; // Auto size (close_long, close_short)
  biz_info: string; // Business info
  stp_act: string; // Self-Trading Prevention action
  stp_id: number; // STP ID
  amend_text: string; // Amend text
}

/**
 * Funding rate
 */
export interface FundingRate {
  t: number; // Funding time (Unix seconds)
  r: string; // Funding rate
}

/**
 * Ticker фьючерса
 */
export interface FuturesTicker {
  contract: string; // BTC_USDT
  last: string; // Last price
  change_percentage: string; // Change percentage (24h)
  total_size: string; // Total size
  low_24h: string; // Lowest price (24h)
  high_24h: string; // Highest price (24h)
  volume_24h: string; // Volume (24h)
  volume_24h_btc: string; // Volume in BTC (24h)
  volume_24h_usd: string; // Volume in USD (24h)
  volume_24h_base: string; // Volume in base currency (24h)
  volume_24h_quote: string; // Volume in quote currency (24h)
  volume_24h_settle: string; // Volume in settle currency (24h)
  mark_price: string; // Mark price
  funding_rate: string; // Current funding rate
  funding_rate_indicative: string; // Indicative funding rate
  index_price: string; // Index price
  quanto_base_rate: string; // Quanto base rate
  basis_rate: string; // Basis rate
  basis_value: string; // Basis value
}

/**
 * Order Book фьючерса (формат такой же, как у спота)
 */
export interface FuturesOrderBook {
  id: number;
  current: number;
  update: number;
  asks: [string, number][]; // [price, size]
  bids: [string, number][];
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export interface CreateFuturesOrderRequest {
  contract: string; // BTC_USDT
  size: number; // Order size (+ для long, - для short)
  iceberg?: number; // Iceberg amount
  price?: string; // Order price (для limit)
  close?: boolean; // Close position
  reduce_only?: boolean; // Reduce only
  tif?: "gtc" | "ioc" | "poc"; // Time in force
  text?: string; // User defined text
  auto_size?: "close_long" | "close_short"; // Auto close
  stp_act?: string; // Self-Trading Prevention
}

export interface UpdateFuturesLeverageRequest {
  contract: string;
  leverage: string;
  cross_leverage_limit?: string;
}

export interface FuturesPositionCloseRequest {
  contract: string;
  side?: "long" | "short"; // Для dual mode
  size?: number; // Частичное закрытие
}

/**
 * Интерфейс баланса спот-аккаунта
 *
 * Документация: https://www.gate.io/docs/developers/apiv4/#list-spot-accounts
 */
export interface Balance {
  /** Валюта (например, USDT, BTC, ETH) */
  currency: string;

  /** Доступный баланс */
  available: string;

  /** Заблокированный баланс (в активных ордерах) */
  locked: string;
}

/**
 * Интерфейс тикера (цена и объём)
 *
 * Документация: https://www.gate.io/docs/developers/apiv4/#retrieve-ticker-information
 */
export interface Ticker {
  /** Торговая пара (например, ETH_USDT) */
  currency_pair: string;

  /** Последняя цена */
  last: string;

  /** Цена покупки (лучший bid) */
  highest_bid: string;

  /** Цена продажи (лучший ask) */
  lowest_ask: string;

  /** Изменение цены за 24 часа (процент) */
  change_percentage: string;

  /** Объём торгов за 24 часа (базовая валюта) */
  base_volume: string;

  /** Объём торгов за 24 часа (quote валюта) */
  quote_volume: string;

  /** Максимальная цена за 24 часа */
  high_24h: string;

  /** Минимальная цена за 24 часа */
  low_24h: string;
}

/**
 * Интерфейс уровня orderbook (цена и объём)
 */
export interface OrderBookLevel {
  /** Цена */
  price: string;

  /** Объём */
  amount: string;
}

/**
 * Интерфейс orderbook (стакан ордеров)
 *
 * Документация: https://www.gate.io/docs/developers/apiv4/#retrieve-order-book
 */
export interface OrderBook {
  /** ID обновления */
  id: number;

  /** Текущее время (Unix timestamp в секундах) */
  current: number;

  /** Время последнего обновления */
  update: number;

  /** Заявки на покупку (bids) - отсортированы по убыванию цены */
  bids: OrderBookLevel[];

  /** Заявки на продажу (asks) - отсортированы по возрастанию цены */
  asks: OrderBookLevel[];
}

/**
 * Параметры для запроса свечей
 */
export interface CandleParams {
  /** Торговая пара (например, ETH_USDT) */
  currencyPair: string;

  /** Интервал свечи: 10s, 1m, 5m, 15m, 30m, 1h, 4h, 8h, 1d, 7d */
  interval:
    | "10s"
    | "1m"
    | "5m"
    | "15m"
    | "30m"
    | "1h"
    | "4h"
    | "8h"
    | "1d"
    | "7d";

  /** Время начала (Unix timestamp в секундах) - опционально */
  from?: number;

  /** Время окончания (Unix timestamp в секундах) - опционально */
  to?: number;

  /** Количество свечей (максимум 1000) - опционально */
  limit?: number;
}

/**
 * Ответ Gate.io API при ошибке
 */
export interface GateioError {
  /** Код ошибки */
  label: string;

  /** Сообщение об ошибке */
  message: string;
}

/**
 * Конфигурация Gate.io клиента
 */
export interface GateioClientConfig {
  /** API ключ */
  apiKey: string;

  /** API Secret */
  apiSecret: string;

  /** Базовый URL API (по умолчанию: https://api.gateio.ws) */
  apiUrl?: string;

  /** Таймаут запросов в миллисекундах (по умолчанию: 30000) */
  timeout?: number;
}
