/**
 * @file src/data/types.ts
 * @version 0
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
