/**
 * @file src/data/types.ts
 * @version 2
 * @description Типы данных для хранилищ (Stores)
 * @changelog
 *   0 - Первая версия (2025-01-22)
 */

/**
 * Тик (упрощённый формат для хранения)
 */
export interface Tick {
  /** Торговая пара */
  symbol: string;

  /** Цена */
  price: number;

  /** Объём 24ч (quote валюта) */
  volume: number;

  /** Изменение за 24ч (%) */
  change24h: number;

  /** Максимум 24ч */
  high24h: number;

  /** Минимум 24ч */
  low24h: number;

  /** Время получения (Unix timestamp мс) */
  timestamp: number;
}

/**
 * Уровень orderbook (цена + объём)
 */
export interface OrderBookLevel {
  /** Цена */
  price: number;

  /** Объём */
  amount: number;
}

/**
 * Обновление orderbook (инкрементальное)
 */
export interface OrderBookUpdate {
  /** Торговая пара */
  symbol: string;

  /** Bids для обновления */
  bids: OrderBookLevel[];

  /** Asks для обновления */
  asks: OrderBookLevel[];

  /** Время обновления */
  timestamp: number;

  /** ID обновления (для синхронизации) */
  updateId: number;
}

/**
 * Полный orderbook (снимок)
 */
export interface OrderBookSnapshot {
  /** Торговая пара */
  symbol: string;

  /** Все bids (отсортированы по убыванию цены) */
  bids: OrderBookLevel[];

  /** Все asks (отсортированы по возрастанию цены) */
  asks: OrderBookLevel[];

  /** Время снимка */
  timestamp: number;

  /** ID последнего обновления */
  lastUpdateId: number;
}

/**
 * Статистика orderbook
 */
export interface OrderBookStats {
  /** Лучший bid (цена покупки) */
  bestBid: number;

  /** Лучший ask (цена продажи) */
  bestAsk: number;

  /** Спред (ask - bid) */
  spread: number;

  /** Спред в процентах */
  spreadPercent: number;

  /** Средняя цена (bid + ask) / 2 */
  midPrice: number;

  /** Суммарный объём bid (USDT) */
  bidVolume: number;

  /** Суммарный объём ask (USDT) */
  askVolume: number;

  /** Общий объём */
  totalVolume: number;

  /** Процент bid от общего объёма */
  bidPercent: number;

  /** Процент ask от общего объёма */
  askPercent: number;
}

/**
 * Свеча от Gate.io
 * Формат REST API: [timestamp, volume, close, high, low, open, amount]
 * Формат WebSocket: {t, v, c, h, l, o, a, n, w}
 */
export interface Candle {
  timestamp: number; // Unix timestamp начала свечи (МИЛЛИСЕКУНДЫ!)
  open: number; // Цена открытия
  high: number; // Максимальная цена
  low: number; // Минимальная цена
  close: number; // Цена закрытия ⭐ (основная для стратегии)
  volume: number; // Объём в базовой валюте (ETH)
  quoteVolume: number; // Объём в котируемой валюте (USDT) - "amount"
}

/**
 * Поддерживаемые таймфреймы
 */
export type Timeframe = "1m" | "6m" | "24m";

/**
 * Маппинг таймфрейм → количество миллисекунд
 */
export const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1m": 60 * 1000, // 60 секунд
  "6m": 6 * 60 * 1000, // 6 минут
  "24m": 24 * 60 * 1000, // 24 минуты
};

/**
 * Количество свечей для агрегации
 */
export const AGGREGATION_COUNT: Record<"1m-to-6m" | "6m-to-24m", number> = {
  "1m-to-6m": 6, // 6 свечей 1m → 1 свеча 6m
  "6m-to-24m": 4, // 4 свечи 6m → 1 свеча 24m
};

/**
 * Статистика по свечам одного таймфрейма
 */
export interface CandleStats {
  timeframe: Timeframe;
  count: number; // Количество свечей в буфере
  totalCount: number; // Всего получено свечей
  isFull: boolean; // Заполнен ли буфер полностью
  lastClose: number | null; // Последняя цена закрытия
  avgVolume: number; // Средний объём (ETH)
  avgQuoteVolume: number; // Средний объём (USDT)
  highestHigh: number | null; // Максимальная HIGH за все свечи
  lowestLow: number | null; // Минимальная LOW за все свечи
  lastTimestamp: number | null; // Timestamp последней свечи
  oldestTimestamp: number | null; // Timestamp самой старой свечи
}

/**
 * Сырые данные свечи от Gate.io REST API
 * Формат: [timestamp, volume, close, high, low, open, amount]
 */
export type RawCandleData = [
  string, // timestamp (seconds as string)
  string, // volume (ETH)
  string, // close
  string, // high
  string, // low
  string, // open
  string // amount (USDT)
];
