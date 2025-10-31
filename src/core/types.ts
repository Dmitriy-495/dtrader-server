// ============================================================================
// FILE: src/core/types.ts - ОБНОВЛЁННАЯ ВЕРСИЯ
// ============================================================================

/**
 * Типы событий в системе
 */
export type EventType =
  // ============================================================================
  // EXCHANGE СОБЫТИЯ
  // ============================================================================
  | "exchange:connected"
  | "exchange:disconnected"
  | "exchange:ping:sent"
  | "exchange:pong:received"
  | "exchange:pong:timeout"
  | "exchange:subscribed"
  | "exchange:unsubscribed"
  | "exchange:reconnecting"
  | "exchange:error"

  // ============================================================================
  // DATA СОБЫТИЯ
  // ============================================================================
  | "data:tick:received"
  | "data:orderbook:updated"
  | "data:orderbook:synced"
  | "data:balance:updated"

  // 🔥 НОВЫЕ СОБЫТИЯ ДЛЯ СВЕЧЕЙ
  | "data:candle:1m:completed" // Завершена свеча 1m
  | "data:candle:6m:completed" // Завершена свеча 6m
  | "data:candle:24m:completed" // Завершена свеча 24m
  | "data:candle:history:loaded" // История свечей загружена

  // ============================================================================
  // INDICATOR СОБЫТИЯ
  // ============================================================================
  | "indicator:tick_speed:updated"
  | "indicator:pressure:updated"
  | "indicator:ema:updated"
  | "indicator:rsi:updated"

  // 🔥 НОВЫЕ СОБЫТИЯ ДЛЯ ИНДИКАТОРОВ СВЕЧЕЙ
  | "indicator:trend_angle:updated" // Trend Angle (HTF/MTF)
  | "indicator:roc:updated" // Rate of Change
  | "indicator:volume_power:updated" // ROC + Volume Power
  | "indicator:vwap:updated" // VWAP Momentum
  | "indicator:volume_trend:updated" // Volume Trend

  // ============================================================================
  // STRATEGY СОБЫТИЯ
  // ============================================================================
  | "strategy:signal:generated"
  | "strategy:htf:approved" // HTF дал разрешение
  | "strategy:mtf:confirmed" // MTF подтвердил импульс
  | "strategy:ltf:ready" // LTF готов к входу

  // ============================================================================
  // TRADING СОБЫТИЯ
  // ============================================================================
  | "trading:order:created"
  | "trading:order:filled"
  | "trading:order:cancelled"
  | "trading:position:opened"
  | "trading:position:closed"
  | "trading:position:updated"

  // ============================================================================
  // CLIENT СОБЫТИЯ
  // ============================================================================
  | "client:connected"
  | "client:disconnected"
  | "client:broadcast"

  // ============================================================================
  // STATE СОБЫТИЯ
  // ============================================================================
  | "state:balance:changed"
  | "state:position:changed"
  | "state:indicator:changed"

  // ============================================================================
  // SYSTEM СОБЫТИЯ
  // ============================================================================
  | "system:startup"
  | "system:shutdown"
  | "system:ready"
  | "system:error";

/**
 * Обработчик события
 */
export type EventHandler = (...args: any[]) => void | Promise<void>;

/**
 * Интерфейс для типизации данных событий
 */
export interface EventDataMap {
  // Exchange
  "exchange:connected": { timestamp: number };
  "exchange:disconnected": { timestamp: number };
  "exchange:ping:sent": { timestamp: number };
  "exchange:pong:received": { timestamp: number; latency: number };
  "exchange:pong:timeout": { timestamp: number };
  "exchange:subscribed": { channel?: string; channels?: string[]; timestamp?: number };
  "exchange:unsubscribed": { channel?: string; timestamp?: number };
  "exchange:reconnecting": { attempt?: number; delay?: number; timestamp?: number };
  "exchange:error": { error?: Error; message?: string; code?: number; channel?: string };

  // Data - Ticks
  "data:tick:received": {
    symbol: string;
    price: number;
    volume: number;
    change24h: number;
    high24h: number;
    low24h: number;
    timestamp: number;
  };

  // Data - Order Book
  "data:orderbook:updated": {
    symbol: string;
    bids: Array<{ price: number; amount: number }>;
    asks: Array<{ price: number; amount: number }>;
    updateId: number;
    timestamp: number;
  };

  "data:orderbook:synced": {
    symbol: string;
    timestamp: number;
  };

  // Data - Balance
  "data:balance:updated": Array<{
    currency: string;
    available: string;
    locked: string;
  }>;

  // 🔥 Data - Candles
  "data:candle:1m:completed": {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    quoteVolume: number;
  };

  "data:candle:6m:completed": {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    quoteVolume: number;
  };

  "data:candle:24m:completed": {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    quoteVolume: number;
  };

  "data:candle:history:loaded": {
    candles1m: number;
    candles6m: number;
    candles24m: number;
    timestamp: number;
  };

  // Indicators
  "indicator:tick_speed:updated": {
    ticksPerMinute: number;
    activityLevel: string;
    isSpike: boolean;
    trend: string;
  };

  "indicator:pressure:updated": {
    bidVolume: number;
    askVolume: number;
    totalVolume: number;
    bidPercent: number;
    askPercent: number;
    imbalance: number;
    direction: string;
    spread: number;
    spreadPercent: number;
  };

  // 🔥 Новые индикаторы
  "indicator:trend_angle:updated": {
    timeframe: "6m" | "24m";
    angle: number;
    period: number;
    trend: "up" | "down" | "flat";
  };

  "indicator:ema:updated": {
    timeframe: "6m" | "24m";
    period: number;
    value: number;
    trend: "up" | "down" | "flat";
  };

  "indicator:roc:updated": {
    timeframe: "6m" | "24m";
    period: number;
    value: number;
  };

  "indicator:volume_power:updated": {
    timeframe: "6m" | "24m";
    rocValue: number;
    volumePower: number;
    combinedScore: number;
  };

  "indicator:vwap:updated": {
    value: number;
    momentum: number;
    direction: "up" | "down" | "flat";
  };

  "indicator:volume_trend:updated": {
    timeframe: "24m";
    avgVolume: number;
    currentVolume: number;
    ratio: number;
    trend: "increasing" | "decreasing" | "stable";
  };

  // Strategy
  "strategy:signal:generated": {
    type: "LONG" | "SHORT";
    htfScore: number;
    mtfScore: number;
    ltfScore: number;
    confidence: number;
    timestamp: number;
  };

  "strategy:htf:approved": {
    trendScore: number;
    approved: boolean;
  };

  "strategy:mtf:confirmed": {
    impulseScore: number;
    confirmed: boolean;
  };

  "strategy:ltf:ready": {
    pressureScore: number;
    ready: boolean;
  };

  // Trading
  "trading:order:created": {
    orderId: string;
    side: "buy" | "sell";
    price: number;
    amount: number;
  };

  "trading:position:opened": {
    positionId: string;
    side: "long" | "short";
    entryPrice: number;
    size: number;
  };

  // System
  "system:startup": { timestamp: number };
  "system:shutdown": { timestamp: number };
  "system:ready": { timestamp: number };
  "system:error": { error: Error };
}
