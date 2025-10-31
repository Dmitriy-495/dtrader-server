/**
 * @file src/exchange/utils.ts
 * @version 0
 * @description Утилиты для работы с Gate.io API (подпись запросов, форматирование)
 * @changelog
 *   0 - Первая версия (2025-01-22)
 */

import * as crypto from "crypto";

/**
 * Генерация подписи для Gate.io API
 *
 * Gate.io использует HMAC-SHA512 для подписи запросов:
 * 1. Хэшируем тело запроса через SHA512
 * 2. Формируем строку: method + '\n' + path + '\n' + query + '\n' + bodyHash + '\n' + timestamp
 * 3. Подписываем строку через HMAC-SHA512 с API Secret
 *
 * Документация: https://www.gate.io/docs/developers/apiv4/#authentication
 *
 * @param method - HTTP метод (GET, POST, PUT, DELETE)
 * @param path - путь запроса (например, /api/v4/spot/accounts)
 * @param query - query параметры в формате строки (например, "currency_pair=ETH_USDT&limit=100")
 * @param body - тело запроса в формате JSON (пустая строка для GET)
 * @param timestamp - Unix timestamp в секундах
 * @param secret - API Secret
 * @returns строка подписи в hex формате
 *
 * @example
 * const signature = generateSignature(
 *   'GET',
 *   '/api/v4/spot/accounts',
 *   '',
 *   '',
 *   1640000000,
 *   'your_api_secret'
 * );
 */
export function generateSignature(
  method: string,
  path: string,
  query: string,
  body: string,
  timestamp: number,
  secret: string
): string {
  // 1. Хэшируем тело запроса (SHA512)
  const bodyHash = crypto.createHash("sha512").update(body).digest("hex");

  // 2. Формируем строку для подписи
  // Формат: METHOD\nPATH\nQUERY\nBODY_HASH\nTIMESTAMP
  const signString = `${method}\n${path}\n${query}\n${bodyHash}\n${timestamp}`;

  // 3. Подписываем через HMAC-SHA512
  const signature = crypto
    .createHmac("sha512", secret)
    .update(signString)
    .digest("hex");

  return signature;
}

/**
 * Преобразование объекта в query строку
 *
 * @param params - объект с параметрами
 * @returns query строка (например, "currency_pair=ETH_USDT&limit=100")
 *
 * @example
 * const query = buildQueryString({ currency_pair: 'ETH_USDT', limit: 100 });
 * // Результат: "currency_pair=ETH_USDT&limit=100"
 */
export function buildQueryString(params: Record<string, any>): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      parts.push(
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`
      );
    }
  }

  return parts.join("&");
}

/**
 * Форматирование баланса для отображения
 *
 * @param value - значение баланса (строка)
 * @param decimals - количество знаков после запятой (по умолчанию: 8)
 * @returns отформатированное значение
 *
 * @example
 * formatBalance("1000.123456789", 2); // "1000.12"
 * formatBalance("0.00000123", 8);     // "0.00000123"
 */
export function formatBalance(value: string, decimals: number = 8): string {
  return parseFloat(value).toFixed(decimals);
}

/**
 * Проверка, является ли баланс ненулевым
 *
 * @param available - доступный баланс
 * @param locked - заблокированный баланс
 * @returns true если хотя бы одно значение > 0
 */
export function isNonZeroBalance(available: string, locked: string): boolean {
  return parseFloat(available) > 0 || parseFloat(locked) > 0;
}

/**
 * Получить текущее время в секундах (Unix timestamp)
 *
 * @returns текущее время в секундах
 */
export function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Валидация торговой пары (формат: BASE_QUOTE)
 *
 * @param pair - торговая пара (например, ETH_USDT)
 * @returns true если формат корректен
 *
 * @example
 * isValidCurrencyPair("ETH_USDT");  // true
 * isValidCurrencyPair("BTC_USD");   // true
 * isValidCurrencyPair("ETHUSDT");   // false (нет подчёркивания)
 */
export function isValidCurrencyPair(pair: string): boolean {
  return /^[A-Z0-9]+_[A-Z0-9]+$/.test(pair);
}

/**
 * Парсинг ошибки Gate.io API
 *
 * @param error - объект ошибки axios
 * @returns человекочитаемое сообщение об ошибке
 */
export function parseGateioError(error: any): string {
  if (error.response?.data) {
    const data = error.response.data;

    // Формат ошибки Gate.io: { label: "...", message: "..." }
    if (data.label && data.message) {
      return `Gate.io API Error [${data.label}]: ${data.message}`;
    }

    // Иногда возвращается просто message
    if (data.message) {
      return `Gate.io API Error: ${data.message}`;
    }

    return `Gate.io API Error: ${JSON.stringify(data)}`;
  }

  if (error.request) {
    return "No response from Gate.io API (network error or timeout)";
  }

  return error.message || "Unknown error";
}
import { Candle, RawCandleData } from "../data/types";

/**
 * Парсинг сырых данных свечи от Gate.io REST API
 * Формат: [timestamp, volume, close, high, low, open, amount]
 *
 * @param raw - Массив строк от API
 * @returns Объект Candle
 */
export function parseCandleFromRaw(raw: RawCandleData): Candle {
  return {
    timestamp: parseInt(raw[0]) * 1000, // Секунды → миллисекунды ⭐
    volume: parseFloat(raw[1]), // volume (ETH)
    close: parseFloat(raw[2]), // close ⭐
    high: parseFloat(raw[3]), // high
    low: parseFloat(raw[4]), // low
    open: parseFloat(raw[5]), // open
    quoteVolume: parseFloat(raw[6]), // amount (USDT)
  };
}

/**
 * Парсинг массива свечей
 */
export function parseCandles(rawCandles: RawCandleData[]): Candle[] {
  return rawCandles.map(parseCandleFromRaw);
}
