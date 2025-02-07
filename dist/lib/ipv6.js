"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils");
const fs_1 = require("fs");
const path_1 = require("path");
const net_1 = require("net");
const debug = utils_1.createDebug("ipv6");
class Ipv6ToRegion {
    /**  数据库文件位置 */
    dbFilePath;
    data;
    name;
    offlen;
    //private iplen: number;
    //private v: number;
    record;
    indexStart;
    //private versionStart: number;
    ipv4;
    constructor(dbPath) {
        const p = dbPath || path_1.join(__dirname, '../../data/ipv6wry.db');
        this.dbFilePath = path_1.isAbsolute(p) ? p : path_1.resolve(__dirname, p);
        if (!fs_1.existsSync(this.dbFilePath)) {
            throw new Error("[Ipv6ToRegion] db file not exists : " + this.dbFilePath);
        }
        this.data = fs_1.readFileSync(this.dbFilePath);
        this.name = this.data.toString("utf-8", 0, 4);
        if (this.name !== "IPDB") {
            throw new Error("[Ipv6ToRegion] db file error");
        }
        this.offlen = this.data.readInt8(6);
        //this.iplen = this.data.readInt8(7);
        //this.v = this.data.readInt8(4);
        this.record = Number(this.data.readBigInt64LE(8));
        this.indexStart = Number(this.data.readBigInt64LE(16));
        //this.versionStart = Number(this.data.readBigInt64LE(32));
    }
    setIpv4Ins(ins) {
        this.ipv4 = ins;
    }
    searchIpv4(ip) {
        if (!this.ipv4) {
            return { cArea: "未知", aArea: "未知" };
        }
        debug("searchIpv4", Number(ip));
        return this.ipv4.searchLong(Number(ip));
    }
    /**
     * 读取 Long 数据
     * @param offset 偏移量
     */
    readLongData(offset) {
        return this.data.readIntLE(offset, this.offlen);
    }
    /**
     * 使用二分法查找网络字节编码的IP地址的索引记录
     * @param ip IP地址
     * @param l 左边界
     * @param r 右边界
     */
    find(ip, l, r) {
        if (r - l <= 1) {
            return l;
        }
        const m = (l + r) >> 1;
        const o = this.indexStart + m * (8 + this.offlen);
        const new_ip = this.data.readBigUInt64LE(o);
        // debug(new_ip);
        if (ip < new_ip) {
            return this.find(ip, l, m);
        }
        else {
            return this.find(ip, m, r);
        }
    }
    /**
     * 读取字符串信息
     * @param offset 偏移量
     */
    getString(offset = 0) {
        // 读取字符串信息，包括"国家"信息和"地区"信息,QQWry.Dat的记录区每条信息都是一个以"\0"结尾的字符串
        const o2 = this.data.indexOf("\0", offset);
        // 有可能只有国家信息没有地区信息，
        return this.data.toString("utf-8", offset, o2);
    }
    /**
     * 读取区域信息字符串
     * @param offset 偏移量
     */
    getAreaAddr(offset = 0) {
        const byte = this.data.readInt8(offset);
        if (byte == 1 || byte == 2) {
            // 第一个字节为 1 或者 2 时，取得 2-4 字节作为一个偏移量调用自己
            const p = this.readLongData(offset + 1);
            return this.getAreaAddr(p);
        }
        else {
            return this.getString(offset);
        }
    }
    /**
     * 获取地址信息
     * @param offset 偏移量
     */
    getAddr(offset) {
        let o = offset;
        const byte = this.data.readInt8(o);
        debug(byte);
        if (byte === 1) {
            // 重定向模式 1 ：[IP][0x01][国家和地区信息的绝对偏移地址]，使用接下来的3字节作为偏移量调用字节取得信息
            return this.getAddr(this.readLongData(o + 1));
        }
        else {
            // 重定向模式 2 + 正常模式：[IP][0x02][信息的绝对偏移][...]
            const cArea = this.getAreaAddr(o);
            debug(cArea);
            if (byte == 2) {
                o += 1 + this.offlen;
            }
            else {
                o = this.data.indexOf("\0", o) + 1;
            }
            const aArea = this.getAreaAddr(o);
            debug(aArea);
            return { cArea: cArea.replace(/\s/g, ""), aArea };
        }
    }
    parseResult(ret) {
        if (ret === null)
            return ret;
        if ("city" in ret) {
            return this.ipv4 ? this.ipv4.parseResult(ret) : null;
        }
        let country = "";
        let province = "";
        let city = "";
        let first = ret.cArea.indexOf("国");
        if (first === 1) {
            first += 1;
            country = ret.cArea.slice(0, first);
        }
        else {
            first = 0;
        }
        let isCity = false;
        let second = ret.cArea.indexOf("省");
        if (second >= 0) {
            second += 1;
            province = ret.cArea.slice(first, second);
        }
        else {
            // TODO: 重构省份处理程序
            const provinceArr = ["内蒙古", "广西", "西藏", "宁夏", "新疆"];
            const goverCity = ["北京市", "天津市", "上海市", "重庆市"];
            for (let gover of goverCity) {
                second = ret.cArea.indexOf(gover);
                if (second >= 0) {
                    second = second + gover.length;
                    province = ret.cArea.slice(first, second);
                    isCity = true;
                    break;
                }
            }
            if (isCity != true) {
                for (let p of provinceArr) {
                    second = ret.cArea.indexOf(p);
                    if (second >= 0) {
                        second = second + p.length;
                        province = ret.cArea.slice(first, second);
                        break;
                    }
                }
            }
        }
        if (isCity != true) {
            const city1 = ret.cArea.indexOf("市");
            const city2 = ret.cArea.indexOf("州");
            // console.log("second",ret,second, city1, city2)
            if (city1 >= 0 && city2 >= 0 && city1 < city2 && second < city1) {
                city = ret.cArea.slice(second, city1 + 1);
            }
            else if (city1 >= 0 && city2 >= 0 && city1 > city2 && second < city2) {
                if (city1 - city2 == 1) {
                    city = ret.cArea.slice(second, city2 + 2);
                }
                else {
                    city = ret.cArea.slice(second, city2 + 1);
                }
            }
            else if (city1 >= 0 && second < city1) {
                city = ret.cArea.slice(second, city1 + 1);
            }
            else if (city2 >= 0 && second < city2) {
                city = ret.cArea.slice(second, city2 + 1);
            }
        }
        province = province.trim();
        city = city.trim();
        return { isp: ret.aArea, data: ret.cArea, country, province, city };
    }
    getIpAddrLong(ip) {
        // 查找ip的索引偏移
        const idx = this.find(ip, 0, this.record);
        debug(idx);
        // 得到索引记录
        const ipOff = this.indexStart + idx * (8 + this.offlen);
        const ipRecOff = this.readLongData(ipOff + 8);
        debug({ ipOff, ipRecOff });
        return this.getAddr(ipRecOff);
    }
    searchLong(ip6) {
        // 本机地址
        if (ip6 === 0x1n) {
            return { cArea: "IANA保留地址", aArea: "本机地址" };
        }
        const ip = (ip6 >> 64n) & 0xffffffffffffffffn;
        debug("ip", ip);
        // IPv4映射地址
        if (ip == 0n) {
            debug("IPv4映射地址");
            const realip = ip6 & 0xffffffffn;
            return this.searchIpv4(realip);
        }
        // 6to4
        if (((ip >> 48n) & 0xffffn) === 0x2002n) {
            debug("6to4");
            const realip = (ip & 0x0000ffffffff0000n) >> 16n;
            return this.searchIpv4(realip);
        }
        // teredo
        if (((ip >> 32n) & 0xffffffffn) == 0x20010000n) {
            debug("teredo");
            // const serverip = (ip & 0xFFFFFFFFn);
            const realip = ~ip6 & 0xffffffffn;
            return this.searchIpv4(realip);
        }
        // isatap
        if (((ip6 >> 32n) & 0xffffn) == 0x5efen) {
            debug("isatap");
            const realip = ip6 & 0xffffffffn;
            return this.searchIpv4(realip);
        }
        debug("IPv6");
        return this.getIpAddrLong(ip);
    }
    search(ipaddr, parse = true) {
        // 把IP地址转成数字
        const { ip, num } = utils_1.ipv6ToLong(ipaddr);
        if (!net_1.isIPv6(ip))
            return null;
        debug({ ipaddr, ip, num });
        const ret = this.searchLong(num);
        debug(ret);
        return parse ? this.parseResult(ret) : ret;
    }
}
exports.default = Ipv6ToRegion;
//# sourceMappingURL=ipv6.js.map