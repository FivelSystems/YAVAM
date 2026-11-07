export namespace auth {
	
	export class User {
	    id: string;
	    username: string;
	    role: string;
	    deviceName: string;
	    ipAddress: string;
	    createdAt: string;
	    isSystem: boolean;
	
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
	        this.isSystem = source["isSystem"];
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
	    allowRemotePasswordLogin: boolean;
	    serverBindAddress: string;
	    serverAllowedHosts: string[];
	    lastSeenVersion: string;
	    updateChannel: string;
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
	        this.allowRemotePasswordLogin = source["allowRemotePasswordLogin"];
	        this.serverBindAddress = source["serverBindAddress"];
	        this.serverAllowedHosts = source["serverAllowedHosts"];
	        this.lastSeenVersion = source["lastSeenVersion"];
	        this.updateChannel = source["updateChannel"];
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
	
	export class BulkDeleteResult {
	    filePath: string;
	    success: boolean;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new BulkDeleteResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.filePath = source["filePath"];
	        this.success = source["success"];
	        this.error = source["error"];
	    }
	}
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

export namespace remoteaccess {
	
	export class PairingGrant {
	    code: string;
	    expiresAt: string;
	
	    static createFrom(source: any = {}) {
	        return new PairingGrant(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.code = source["code"];
	        this.expiresAt = source["expiresAt"];
	    }
	}
	export class PairingState {
	    active: boolean;
	    expiresAt: string;
	
	    static createFrom(source: any = {}) {
	        return new PairingState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.active = source["active"];
	        this.expiresAt = source["expiresAt"];
	    }
	}
	export class State {
	    hasCustomPassword: boolean;
	    allowRemotePasswordLogin: boolean;
	    serverBindAddress: string;
	    pairing: PairingState;
	
	    static createFrom(source: any = {}) {
	        return new State(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hasCustomPassword = source["hasCustomPassword"];
	        this.allowRemotePasswordLogin = source["allowRemotePasswordLogin"];
	        this.serverBindAddress = source["serverBindAddress"];
	        this.pairing = this.convertValues(source["pairing"], PairingState);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
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

