export { };

declare global {
    interface Window {
        go: {
            main: {
                App: {
                    Greet(name: string): Promise<string>;
                    ScanPackages(vamPath: string): Promise<any>;
                    TogglePackage(pkgPath: string, enable: boolean, vamPath: string): Promise<string>;
                    InstallFiles(files: string[], vamPath: string): Promise<string[]>;
                    GetFilters(vamPath: string): Promise<string[]>;
                };
            };
        };
        runtime: {
            EventsOn(eventName: string, callback: (...data: any) => void): void;
            WindowSetTitle(title: string): void;
        };
    }
}
