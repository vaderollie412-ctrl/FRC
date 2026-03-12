import type { SQLExecutor } from '@netlify/dev';
interface DBConnection {
    executor: SQLExecutor;
    cleanup: () => Promise<void>;
}
export declare function connectToDatabase(buildDir: string): Promise<DBConnection>;
export {};
//# sourceMappingURL=db-connection.d.ts.map