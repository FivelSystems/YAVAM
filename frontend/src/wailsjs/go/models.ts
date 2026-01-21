export namespace auth {
	
	export class User {
	    id: string;
	    username: string;
	    role: string;
	    deviceName: string;
	    ipAddress: string;
	    createdAt: string;
	
	    static createFrom(source: any = {}) {
	        return new User(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.username = source["username"];
	        this.role = source["role"];
	        this.deviceName = source["deviceName"];
	        this.ipAddress = source["ipAddress"];
	        this.createdAt = source["createdAt"];
	    }
	}

}

export namespace config {
	
	export class Config {
	    libraries: string[];
	    setupDone: boolean;
	    theme: string;
	    accentColor: string;
	    autoScan: boolean;
	    checkUpdates: boolean;
	    useSymlinks: boolean;
	    deleteToTrash: boolean;
	    publicAccess: boolean;
	    serverEnabled: boolean;
	    serverPort: string;
	    authPollInterval: number;
	    lastSeenVersion: string;
	    privacyMode: boolean;
	    keybinds?: Record<string, Array<string>>;
	    gridSize: number;
	    sortMode: string;
	    itemsPerPage: number;
	    censorThumbnails: boolean;
	    blurAmount: number;
	    hidePackageNames: boolean;
	    hideCreatorNames: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.libraries = source["libraries"];
	        this.setupDone = source["setupDone"];
	        this.theme = source["theme"];
	        this.accentColor = source["accentColor"];
	        this.autoScan = source["autoScan"];
	        this.checkUpdates = source["checkUpdates"];
	        this.useSymlinks = source["useSymlinks"];
	        this.deleteToTrash = source["deleteToTrash"];
	        this.publicAccess = source["publicAccess"];
	        this.serverEnabled = source["serverEnabled"];
	        this.serverPort = source["serverPort"];
	        this.authPollInterval = source["authPollInterval"];
	        this.lastSeenVersion = source["lastSeenVersion"];
	        this.privacyMode = source["privacyMode"];
	        this.keybinds = source["keybinds"];
	        this.gridSize = source["gridSize"];
	        this.sortMode = source["sortMode"];
	        this.itemsPerPage = source["itemsPerPage"];
	        this.censorThumbnails = source["censorThumbnails"];
	        this.blurAmount = source["blurAmount"];
	        this.hidePackageNames = source["hidePackageNames"];
	        this.hideCreatorNames = source["hideCreatorNames"];
	    }
	}

}

export namespace manager {
	
	export class DiskSpaceInfo {
	    free: number;
	    total: number;
	    totalFree: number;
	
	    static createFrom(source: any = {}) {
	        return new DiskSpaceInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.free = source["free"];
	        this.total = source["total"];
	        this.totalFree = source["totalFree"];
	    }
	}

}

export namespace models {
	
	export class FileDetail {
	    name: string;
	    size: number;
	    path: string;
	
	    static createFrom(source: any = {}) {
	        return new FileDetail(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.size = source["size"];
	        this.path = source["path"];
	    }
	}
	export class PackageContent {
	    filePath: string;
	    fileName: string;
	    type: string;
	    thumbnailBase64?: string;
	    size: number;
	
	    static createFrom(source: any = {}) {
	        return new PackageContent(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.filePath = source["filePath"];
	        this.fileName = source["fileName"];
	        this.type = source["type"];
	        this.thumbnailBase64 = source["thumbnailBase64"];
	        this.size = source["size"];
	    }
	}
	export class ResolveConflictResult {
	    merged: number;
	    disabled: number;
	    newPath: string;
	
	    static createFrom(source: any = {}) {
	        return new ResolveConflictResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.merged = source["merged"];
	        this.disabled = source["disabled"];
	        this.newPath = source["newPath"];
	    }
	}

}

export namespace updater {
	
	export class UpdateInfo {
	    version: string;
	    changelog: string;
	    downloadUrl: string;
	
	    static createFrom(source: any = {}) {
	        return new UpdateInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.changelog = source["changelog"];
	        this.downloadUrl = source["downloadUrl"];
	    }
	}

}

