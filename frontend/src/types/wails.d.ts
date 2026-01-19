
export { };

declare global {
    interface Window {
        go: {
            main: {
                App: {
                    ScanPackages(path: string): Promise<void>;
                    CancelScan(): Promise<void>;
                    GetLibraryCounts(paths: string[]): Promise<Record<string, number>>;
                    GetPackageThumbnail(filePath: string): Promise<string>;
                    GetPackageContents(filePath: string): Promise<any[]>;
                    InstallPackage(filePath: string, targetLib: string): Promise<void>;
                    OpenFolder(path: string): Promise<void>;
                    DeletePackages(paths: string[]): Promise<void>;
                }
            }
        };
        runtime: {
            EventsOn(eventName: string, callback: (...args: any[]) => void): void;
            EventsOff(eventName: string): void;
            BrowserOpenURL(url: string): void;
        };
    }
}
