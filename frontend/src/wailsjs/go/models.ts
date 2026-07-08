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
	export class MetaJSON {
	    creator: string;
	    creatorName?: string;
	    packageName: string;
	    version: string;
	    description?: string;
	    licenseType?: string;
	    dependencies?: Record<string, any>;
	    contentList?: string[];
	    tags?: string[];
	    imageUrl?: string;
	
	    static createFrom(source: any = {}) {
	        return new MetaJSON(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.creator = source["creator"];
	        this.creatorName = source["creatorName"];
	        this.packageName = source["packageName"];
	        this.version = source["version"];
	        this.description = source["description"];
	        this.licenseType = source["licenseType"];
	        this.dependencies = source["dependencies"];
	        this.contentList = source["contentList"];
	        this.tags = source["tags"];
	        this.imageUrl = source["imageUrl"];
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
	export class VarPackage {
	    filePath: string;
	    fileName: string;
	    size: number;
	    meta: MetaJSON;
	    thumbnailPath: string;
	    thumbnailBase64: string;
	    isEnabled: boolean;
	    hasThumbnail: boolean;
	    missingDeps: string[];
	    isDuplicate: boolean;
	    isFavorite: boolean;
	    rating: number;
	    isHidden: boolean;
	    isRemovable: boolean;
	    isExactDuplicate: boolean;
	    referencedBy?: string[];
	    obsoletedBy?: string;
	    licenseType: string;
	    type: string;
	    categories: string[];
	    tags?: string[];
	    creationDate: string;
	    isCorrupt: boolean;
	
	    static createFrom(source: any = {}) {
	        return new VarPackage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.filePath = source["filePath"];
	        this.fileName = source["fileName"];
	        this.size = source["size"];
	        this.meta = this.convertValues(source["meta"], MetaJSON);
	        this.thumbnailPath = source["thumbnailPath"];
	        this.thumbnailBase64 = source["thumbnailBase64"];
	        this.isEnabled = source["isEnabled"];
	        this.hasThumbnail = source["hasThumbnail"];
	        this.missingDeps = source["missingDeps"];
	        this.isDuplicate = source["isDuplicate"];
	        this.isFavorite = source["isFavorite"];
	        this.rating = source["rating"];
	        this.isHidden = source["isHidden"];
	        this.isRemovable = source["isRemovable"];
	        this.isExactDuplicate = source["isExactDuplicate"];
	        this.referencedBy = source["referencedBy"];
	        this.obsoletedBy = source["obsoletedBy"];
	        this.licenseType = source["licenseType"];
	        this.type = source["type"];
	        this.categories = source["categories"];
	        this.tags = source["tags"];
	        this.creationDate = source["creationDate"];
	        this.isCorrupt = source["isCorrupt"];
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

