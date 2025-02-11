"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils");
const fs_1 = require("fs");
const path_1 = require("path");
const net_1 = require("net");
const debug = utils_1.createDebug("ipv4");
/**
 * IP v4 解析
 */
class Ipv4ToRegion {
    /**  数据库文件位置 */
    dbFilePath;
    // init basic search environment
    superBlock = Buffer.allocUnsafe(8);
    indexBlockLength = 12;
    data;
    firstIndexPtr;
    lastIndexPtr;
    totalBlocks;
    constructor(dbPath) {
        const p = dbPath || path_1.join(__dirname, '../../data/ip2region.db');
        this.dbFilePath = path_1.isAbsolute(p) ? p : path_1.resolve(__dirname, p);
        if (!fs_1.existsSync(this.dbFilePath)) {
            throw new Error("[Ipv4ToRegion] db file not exists : " + this.dbFilePath);
        }
        this.data = fs_1.readFileSync(this.dbFilePath);
        this.data.copy(this.superBlock, 0, 0, 8);
        this.firstIndexPtr = this.superBlock.readUInt32LE(0);
        this.lastIndexPtr = this.superBlock.readUInt32LE(4);
        this.totalBlocks = (this.lastIndexPtr - this.firstIndexPtr) / this.indexBlockLength + 1;
        debug(this.totalBlocks);
    }
    parseResult(res) {
        if (res === null)
            return res;
        // 城市Id|国家|区域|省份|城市|ISP
        const data = res.region.split("|");
        return {
            id: res.city,
            country: data[0] !== "0" ? data[0] : "",
            region: data[1] !== "0" ? data[1] : "",
            province: data[2] !== "0" ? data[2] : "",
            city: data[3] !== "0" ? data[3] : "",
            isp: data[4] !== "0" ? data[4] : "",
        };
    }
    searchLong(ip) {
        let low = 0;
        let mid = 0;
        let high = this.totalBlocks;
        let dataPos = 0;
        let pos = 0;
        let sip = 0;
        let eip = 0;
        // binary search
        while (low <= high) {
            mid = (low + high) >> 1;
            pos = this.firstIndexPtr + mid * this.indexBlockLength;
            sip = this.data.readUInt32LE(pos);
            debug(" sip : " + sip + " eip : " + eip);
            if (ip < sip) {
                high = mid - 1;
            }
            else {
                eip = this.data.readUInt32LE(pos + 4);
                if (ip > eip) {
                    low = mid + 1;
                }
                else {
                    dataPos = this.data.readUInt32LE(pos + 8);
                    break;
                }
            }
        }
        // read data
        if (dataPos === 0)
            return null;
        const dataLen = (dataPos >> 24) & 0xff;
        dataPos = dataPos & 0x00ffffff;
        const city_id = this.data.readUInt32LE(dataPos);
        const data = this.data.toString("utf8", dataPos + 4, dataPos + dataLen);
        debug(city_id);
        debug(data);
        return { city: city_id, region: data };
    }
    search(ipaddr, parse = true) {
        if (!net_1.isIPv4(ipaddr))
            return null;
        const ip = utils_1.ipv4ToLong(ipaddr);
        // first search  (in header index)
        const ret = this.searchLong(ip);
        return parse ? this.parseResult(ret) : ret;
    }
}
exports.default = Ipv4ToRegion;
//# sourceMappingURL=ipv4.js.map