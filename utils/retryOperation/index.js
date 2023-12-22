

// TODO: Fix this?
export const retryOperation = (operation, delay, times) => new Promise((resolve, reject) => {
    return operation()
        .then(resolve)
        .catch((error) => {
            if (times === 0) {
                return reject(error);
            }
            setTimeout(() => {
                return retryOperation(operation, delay, times - 1)
                    .then(resolve)
                    .catch(reject);
            }, delay);
        });
});