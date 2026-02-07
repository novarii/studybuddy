// Polyfill Promise.withResolvers for Safari < 17.4 / iOS < 17.4
// pdfjs-dist 5.x requires it — without this, iPad Safari crashes
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
