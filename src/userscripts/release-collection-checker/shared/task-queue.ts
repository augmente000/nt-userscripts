export class TaskQueue {
    private activeTasks = 0;
    private readonly pendingTasks: Array<() => void> = [];

    constructor(private readonly concurrency: number) {}

    run<T>(task: () => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const start = (): void => {
                this.activeTasks += 1;
                task()
                    .then(resolve, reject)
                    .finally(() => {
                        this.activeTasks -= 1;
                        this.startNext();
                    });
            };

            this.pendingTasks.push(start);
            this.startNext();
        });
    }

    private startNext(): void {
        while (this.activeTasks < this.concurrency) {
            const start = this.pendingTasks.shift();
            if (!start) {
                return;
            }

            start();
        }
    }
}
