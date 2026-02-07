// Polyfills for pdfjs-dist 5.x on older Safari/iOS
// Promise.withResolvers: Safari 17.4+ (iOS 17.4+)
// URL.parse: Safari 18.0+ (iOS 18.0+)

if (typeof Promise.withResolvers === "undefined") {
  Promise.withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

if (typeof URL.parse === "undefined") {
  URL.parse = function (url: string, base?: string | URL): URL | null {
    try {
      return new URL(url, base);
    } catch {
      return null;
    }
  };
}
