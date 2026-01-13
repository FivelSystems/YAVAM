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

