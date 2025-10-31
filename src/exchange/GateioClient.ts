/**
 * @file src/exchange/GateioClient.ts
 * @version 0
 * @description REST API клиент для Gate.io
 * @changelog
 *   0 - Первая версия (2025-01-22)
 */

import axios, { AxiosInstance } from "axios";
import { eventBus } from "../core/EventBus";
import { logger } from "../logger/Logger";
import { LogCategory } from "../logger/types";
import { GATEIO } from "../config/constants";
import {
  generateSignature,
  buildQueryString,
  getCurrentTimestamp,
  parseGateioError,
  isValidCurrencyPair,
} from "./utils";
import type { Candle } from "../data/types";
import type { GateioClientConfig, Balance, Ticker, OrderBook } from "./types";
import { parseCandles } from "./utils";

/**
 * REST API клиент для Gate.io
 *
 * Поддерживает:
 * - Получение баланса
 * - Получение цены (ticker)
 * - Получение orderbook
 * - Получение свечей (candlesticks)
 * - Автоматическая подпись запросов
 * - Эмит событий через EventBus
 * - Логирование через Logger
 *
 * @example
 * const client = new GateioClient({
 *   apiKey: 'your_key',
 *   apiSecret: 'your_secret',
 * });
 *
 * const balances = await client.getBalance();
 * const ticker = await client.getTicker('ETH_USDT');
 */
export class GateioClient {
  private apiKey: string;
  private apiSecret: string;
  private apiUrl: string;
  private timeout: number;
  private axios: AxiosInstance;

  /**
   * Конструктор
   *
   * @param config - конфигурация клиента
   */
  constructor(config: GateioClientConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.apiUrl = config.apiUrl || "https://api.gateio.ws";
    this.timeout = config.timeout || GATEIO.TIMEOUTS.REQUEST;

    // Создаём axios instance с базовой конфигурацией
    this.axios = axios.create({
      baseURL: this.apiUrl,
      timeout: this.timeout,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    logger.debug("GateioClient инициализирован", LogCategory.EXCHANGE, {
      apiUrl: this.apiUrl,
      timeout: this.timeout,
    });
  }

  /**
   * Выполнить подписанный запрос к Gate.io API
   *
   * @param method - HTTP метод
   * @param path - путь запроса
   * @param params - query параметры (опционально)
   * @param body - тело запроса (опционально)
   * @returns данные ответа
   */
  private async request<T>(
    method: string,
    path: string,
    params?: Record<string, any>,
    body?: any
  ): Promise<T> {
    // Формируем query строку
    const query = params ? buildQueryString(params) : "";

    // Формируем тело запроса
    const bodyString = body ? JSON.stringify(body) : "";

    // Получаем timestamp
    const timestamp = getCurrentTimestamp();

    // Генерируем подпись
    const signature = generateSignature(
      method,
      path,
      query,
      bodyString,
      timestamp,
      this.apiSecret
    );

    // URL с query параметрами
    const url = query ? `${path}?${query}` : path;

    try {
      logger.debug(`${method} ${url}`, LogCategory.EXCHANGE);

      const response = await this.axios.request<T>({
        method,
        url,
        data: bodyString || undefined,
        headers: {
          KEY: this.apiKey,
          Timestamp: timestamp.toString(),
          SIGN: signature,
        },
      });

      return response.data;
    } catch (error: any) {
      const errorMessage = parseGateioError(error);
      logger.error(`Ошибка запроса ${method} ${path}`, LogCategory.EXCHANGE, {
        error: errorMessage,
      });

      // Эмитим событие ошибки
      eventBus.emitSafe("exchange:error", {
        method,
        path,
        error: errorMessage,
      });

      throw new Error(errorMessage);
    }
  }

  /**
   * Получить баланс спот-аккаунта
   *
   * Документация: https://www.gate.io/docs/developers/apiv4/#list-spot-accounts
   *
   * @param currency - валюта (опционально, если не указано - возвращает все)
   * @returns массив балансов
   *
   * @example
   * const balances = await client.getBalance();
   * const usdtBalance = await client.getBalance('USDT');
   */
  public async getBalance(currency?: string): Promise<Balance[]> {
    logger.info(
      `Запрос баланса${currency ? ` (${currency})` : ""}...`,
      LogCategory.EXCHANGE
    );

    const params = currency ? { currency } : undefined;
    const balances = await this.request<Balance[]>(
      "GET",
      GATEIO.ENDPOINTS.SPOT_ACCOUNTS,
      params
    );

    logger.success("Баланс получен успешно!", LogCategory.EXCHANGE);

    // Эмитим событие обновления баланса
    eventBus.emitSafe("data:balance:updated", balances);

    return balances;
  }

  /**
   * Получить тикер (цену и объём) для торговой пары
   *
   * Документация: https://www.gate.io/docs/developers/apiv4/#retrieve-ticker-information
   *
   * @param currencyPair - торговая пара (например, ETH_USDT)
   * @returns информация о тикере
   *
   * @example
   * const ticker = await client.getTicker('ETH_USDT');
   * console.log(`Цена ETH: ${ticker.last} USDT`);
   */
  public async getTicker(currencyPair: string): Promise<Ticker> {
    if (!isValidCurrencyPair(currencyPair)) {
      throw new Error(`Некорректная торговая пара: ${currencyPair}`);
    }

    logger.debug(`Запрос тикера ${currencyPair}...`, LogCategory.EXCHANGE);

    const tickers = await this.request<Ticker[]>(
      "GET",
      GATEIO.ENDPOINTS.SPOT_TICKER,
      {
        currency_pair: currencyPair,
      }
    );

    if (tickers.length === 0) {
      throw new Error(`Тикер для ${currencyPair} не найден`);
    }

    return tickers[0];
  }

  /**
   * Получить orderbook (стакан ордеров) для торговой пары
   *
   * Документация: https://www.gate.io/docs/developers/apiv4/#retrieve-order-book
   *
   * @param currencyPair - торговая пара (например, ETH_USDT)
   * @param limit - количество уровней (по умолчанию: 20, максимум: 100)
   * @returns orderbook
   *
   * @example
   * const orderbook = await client.getOrderBook('ETH_USDT', 20);
   * console.log(`Лучший bid: ${orderbook.bids[0].price}`);
   * console.log(`Лучший ask: ${orderbook.asks[0].price}`);
   */
  public async getOrderBook(
    currencyPair: string,
    limit: number = 20
  ): Promise<OrderBook> {
    if (!isValidCurrencyPair(currencyPair)) {
      throw new Error(`Некорректная торговая пара: ${currencyPair}`);
    }

    if (limit < 1 || limit > 100) {
      throw new Error(`Лимит должен быть от 1 до 100, получено: ${limit}`);
    }

    logger.debug(
      `Запрос orderbook ${currencyPair} (depth: ${limit})...`,
      LogCategory.EXCHANGE
    );

    const orderbook = await this.request<OrderBook>(
      "GET",
      GATEIO.ENDPOINTS.SPOT_ORDER_BOOK,
      {
        currency_pair: currencyPair,
        limit,
        with_id: true,
      }
    );

    return orderbook;
  }

  /**
   * Получить свечи (candlesticks) для торговой пары
   *
   * Документация: https://www.gate.io/docs/developers/apiv4/#market-candlesticks
   *
   * @param params - параметры запроса
   * @returns массив свечей
   *
   * @example
   * // Последние 100 свечей 1m
   * const candles = await client.getCandles({
   *   currencyPair: 'ETH_USDT',
   *   interval: '1m',
   *   limit: 100,
   * });
   *
   * // Свечи за определённый период
   * const candles = await client.getCandles({
   *   currencyPair: 'ETH_USDT',
   *   interval: '1h',
   *   from: 1640000000,
   *   to: 1640086400,
   * });
   */
  /**
   * Получить исторические свечи
   * Gate.io API: GET /api/v4/spot/candlesticks
   *
   * @param params - Параметры запроса
   * @returns Массив свечей
   */
  public async getCandles(params: {
    currencyPair: string;
    interval: string;
    limit?: number;
    from?: number;
    to?: number;
  }): Promise<Candle[]> {
    const queryParams: Record<string, string | number> = {
      currency_pair: params.currencyPair,
      interval: params.interval,
    };

    if (params.limit) queryParams.limit = params.limit;
    if (params.from) queryParams.from = params.from;
    if (params.to) queryParams.to = params.to;

    try {
      // Gate.io возвращает массив массивов:
      // [[timestamp_sec, volume, close, high, low, open, amount], ...]
      const rawCandles = await this.request<string[][]>(
        "GET",
        GATEIO.ENDPOINTS.SPOT_CANDLESTICKS,
        queryParams
      );

      // Парсим в объекты Candle (reuse utils)
      return parseCandles(rawCandles as any);
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
