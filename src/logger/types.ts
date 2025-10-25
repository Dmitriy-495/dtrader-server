/**
 * @file src/logger/types.ts
 * @version 0
 * @description Типы для системы логирования
 * @changelog
 *   0 - Первая версия (2025-01-22)
 */

/**
 * Уровни логирования
 */
export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
  SUCCESS = "success",
}

/**
 * Категории логов
 *
 * - system: запуск/остановка, подключения клиентов
 * - exchange: связь с Gate.io, ping-pong, подписки
 * - internal: остальные логи (индикаторы, стратегия, и т.д.)
 */
export enum LogCategory {
  SYSTEM = "system",
  EXCHANGE = "exchange",
  INTERNAL = "internal",
}

/**
 * Интерфейс лог-сообщения
 */
export interface LogMessage {
  level: LogLevel;
  category: LogCategory;
  message: string;
  timestamp: number;
  data?: any;
  source?: string;
}

/**
 * Конфигурация логгера
 */
export interface LoggerConfig {
  level: LogLevel;
  toFile: boolean;
  dir: string;
  colors: boolean;
}
