"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ipv4_1 = __importDefault(require("./ipv4"));
const ipv6_1 = __importDefault(require("./ipv6"));
const net_1 = require("net");
class IP2Region {
    ipv4;
    ipv6 = null;
    constructor(opts = {}) {
        this.ipv4 = new ipv4_1.default(opts.ipv4db);
        if (!opts.disableIpv6) {
            this.ipv6 = new ipv6_1.default(opts.ipv6db);
            this.ipv6.setIpv4Ins(this.ipv4);
        }
    }
    searchRaw(ipaddr, parse = true) {
        const v = net_1.isIP(ipaddr);
        if (v === 6 && this.ipv6) {
            return this.ipv6.search(ipaddr, parse);
        }
        return this.ipv4.search(ipaddr, parse);
    }
    /**
     * 搜索
     * @param ipaddr IP 地址
     */
    search(ipaddr) {
        const res = this.searchRaw(ipaddr);
        if (res === null)
            return res;
        return { country: res.country, province: res.province, city: res.city, isp: res.isp };
    }
}
exports.default = IP2Region;
//# sourceMappingURL=index.js.map