// ============================================================================
// FILE: src/exchange/GateioClient.ts - ПОЛНАЯ РАБОЧАЯ ВЕРСИЯ
// ============================================================================

import axios, { AxiosInstance } from "axios";
import * as crypto from "crypto";
import { GATEIO } from "../config/constants";
import { logger } from "../logger/Logger";
import { LogCategory } from "../logger/types";
import { eventBus } from "../core/EventBus";
import {
  buildQueryString,
  getCurrentTimestamp,
  generateSignature,
} from "./utils";
import type { Balance, Ticker, OrderBook } from "./types";
import type { Candle } from "../data/types"; // 🔥 Candle из data/types!

// ============================================================================
// ИНТЕРФЕЙС КОНФИГУРАЦИИ
// ============================================================================

interface GateioClientConfig {
  apiKey: string;
  apiSecret: string;
  apiUrl: string;
  timeout?: number;
}

// ============================================================================
// GATEIO CLIENT
// ============================================================================

export class GateioClient {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly apiUrl: string;
  private readonly httpClient: AxiosInstance;

  constructor(config: GateioClientConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.apiUrl = config.apiUrl;

    this.httpClient = axios.create({
      baseURL: this.apiUrl,
      timeout: config.timeout || GATEIO.TIMEOUTS.REQUEST,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    logger.info("🔧 GateioClient инициализирован", LogCategory.EXCHANGE);
  }

  // ==========================================================================
  // ПРИВАТНЫЕ МЕТОДЫ
  // ==========================================================================

  private async request<T>(
    method: string,
    path: string,
    body?: any
  ): Promise<T> {
    const timestamp = getCurrentTimestamp();
    const bodyString = body ? JSON.stringify(body) : "";
    const bodyHash = crypto
      .createHash("sha512")
      .update(bodyString)
      .digest("hex");

    // Извлекаем query string из path
    const [pathOnly, queryString] = path.split("?");

    const signature = generateSignature(
      method,
      pathOnly,
      queryString || "",
      bodyHash,
      timestamp,
      this.apiSecret
    );

    const headers = {
      KEY: this.apiKey,
      Timestamp: timestamp,
      SIGN: signature,
    };

    try {
      const response = await this.httpClient.request<T>({
        method,
        url: path,
        headers,
        data: body,
      });

      return response.data;
    } catch (error: any) {
      logger.error(
        `Ошибка запроса к Gate.io: ${method} ${path}`,
        LogCategory.EXCHANGE,
        { error: error.message }
      );
      throw error;
    }
  }

  // ==========================================================================
  // ПУБЛИЧНЫЕ МЕТОДЫ - SPOT API
  // ==========================================================================

  /**
   * Получить баланс
   */
  public async getBalance(currency?: string): Promise<Balance[]> {
    try {
      logger.info("Запрос баланса...", LogCategory.EXCHANGE);

      const balances = await this.request<Balance[]>(
        "GET",
        GATEIO.SPOT_ENDPOINTS.SPOT_ACCOUNTS
      );

      logger.success("Баланс получен успешно!", LogCategory.EXCHANGE);

      eventBus.emitSafe("data:balance:updated", balances);

      if (currency) {
        return balances.filter((b) => b.currency === currency);
      }

      return balances;
    } catch (error) {
      logger.error("Ошибка получения баланса", LogCategory.EXCHANGE, { error });
      throw error;
    }
  }

  /**
   * Получить тикер
   */
  public async getTicker(currencyPair: string): Promise<Ticker> {
    try {
      logger.info(`Запрос тикера для ${currencyPair}...`, LogCategory.EXCHANGE);

      const queryParams = { currency_pair: currencyPair };
      const queryString = buildQueryString(queryParams);
      const path = `${GATEIO.SPOT_ENDPOINTS.SPOT_TICKER}?${queryString}`;

      const tickers = await this.request<Ticker[]>("GET", path);

      if (tickers.length === 0) {
        throw new Error(`Тикер для ${currencyPair} не найден`);
      }

      const ticker = tickers.find((t) => t.currency_pair === currencyPair);

      if (!ticker) {
        throw new Error(`Тикер для ${currencyPair} не найден в ответе`);
      }

      logger.success(
        `Тикер получен: ${currencyPair} @ ${ticker.last}`,
        LogCategory.EXCHANGE
      );

      return ticker;
    } catch (error) {
      logger.error(
        `Ошибка получения тикера ${currencyPair}`,
        LogCategory.EXCHANGE,
        { error }
      );
      throw error;
    }
  }

  /**
   * Получить стакан заявок
   */
  public async getOrderBook(
    currencyPair: string,
    limit: number = 20
  ): Promise<OrderBook> {
    try {
      logger.info(
        `Запрос Order Book для ${currencyPair} (limit: ${limit})...`,
        LogCategory.EXCHANGE
      );

      const queryParams = {
        currency_pair: currencyPair,
        limit: limit.toString(),
      };

      const queryString = buildQueryString(queryParams);
      const path = `${GATEIO.SPOT_ENDPOINTS.SPOT_ORDER_BOOK}?${queryString}`;

      const orderbook = await this.request<OrderBook>("GET", path);

      logger.success(
        `Order Book получен: ${orderbook.bids.length} bids, ${orderbook.asks.length} asks`,
        LogCategory.EXCHANGE
      );

      return orderbook;
    } catch (error) {
      logger.error(
        `Ошибка получения Order Book ${currencyPair}`,
        LogCategory.EXCHANGE,
        { error }
      );
      throw error;
    }
  }

  /**
   * Получить исторические свечи
   */
  public async getCandles(params: {
    currencyPair: string;
    interval: string;
    limit?: number;
    from?: number;
    to?: number;
  }): Promise<Candle[]> {
    const queryParams: Record<string, string> = {
      currency_pair: params.currencyPair,
      interval: params.interval,
    };

    if (params.limit) queryParams.limit = params.limit.toString();
    if (params.from) queryParams.from = params.from.toString();
    if (params.to) queryParams.to = params.to.toString();

    const query = Object.entries(queryParams)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join("&");

    const path = `${GATEIO.SPOT_ENDPOINTS.SPOT_CANDLESTICKS}?${query}`;

    try {
      const rawCandles = await this.request<string[][]>("GET", path);

      return rawCandles.map((raw) => ({
        timestamp: parseInt(raw[0]) * 1000,
        open: parseFloat(raw[5]),
        high: parseFloat(raw[3]),
        low: parseFloat(raw[4]),
        close: parseFloat(raw[2]),
        volume: parseFloat(raw[1]),
        quoteVolume: parseFloat(raw[6]),
      }));
    } catch (error) {
      logger.error(
        `Ошибка получения свечей ${params.currencyPair} ${params.interval}`,
        LogCategory.EXCHANGE,
        { error }
      );
      throw error;
    }
  }
}
