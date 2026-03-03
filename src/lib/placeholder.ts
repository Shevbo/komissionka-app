/**
 * Data URI плейсхолдера. Без сетевых запросов — всегда отображается при ошибке загрузки.
 */
export const PLACEHOLDER_DATA_URI =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'%3E%3Crect width='100%25' height='100%25' fill='%23e2e8f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2364748b' font-family='system-ui,sans-serif' font-size='24'%3ENет фото%3C/text%3E%3C/svg%3E";

/** Статический плейсхолдер из public/. Используется в seed. */
export const PLACEHOLDER_STATIC_URL = "/images/placeholder.svg";
