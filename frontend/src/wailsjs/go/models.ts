export namespace models {
	
	export class MetaJSON {
	    creator: string;
	    packageName: string;
	    version: string;
	    description?: string;
	    dependencies?: Record<string, any>;
	
	    static createFrom(source: any = {}) {
	        return new MetaJSON(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.creator = source["creator"];
	        this.packageName = source["packageName"];
	        this.version = source["version"];
	        this.description = source["description"];
	        this.dependencies = source["dependencies"];
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
	    isHidden: boolean;
	
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
	        this.isHidden = source["isHidden"];
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

