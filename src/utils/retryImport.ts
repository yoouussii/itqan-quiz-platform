/**
 * تحميل جزء من الموقع مع إعادة المحاولة: انقطاع لحظي في الإنترنت (خصوصاً على الجوال)
 * لا يُظهر رسالة «تعذّر تحميل الصفحة» من أول محاولة.
 */
export function retryImport<T>(load: () => Promise<T>, tries = 2, delayMs = 1500): Promise<T> {
  return load().catch((err) => {
    if (tries <= 0) throw err;
    return new Promise<T>((resolve, reject) => {
      setTimeout(() => { retryImport(load, tries - 1, delayMs).then(resolve, reject); }, delayMs);
    });
  });
}
