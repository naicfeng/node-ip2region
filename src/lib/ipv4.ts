"use strict";

import { createDebug, ipv4ToLong } from "./utils";
import { existsSync, readFileSync } from "fs";
import { resolve as pathResolve, isAbsolute } from "path";
import { isIPv4 } from "net";

const debug = createDebug();

export interface Ipv4ToRegionOpts {
  dbPath?: string;
}

export interface Ipv4ToRegionRes {
  city: number;
  region: string;
}

export interface Ipv4ToRegionResult {
  id: number;
  country: string;
  region: string;
  province: string;
  city: string;
  isp: string;
}

export default class Ipv4ToRegion {
  private dbFilePath: string;
  // init basic search environment
  private superBlock = Buffer.allocUnsafe(8);
  private indexBlockLength = 12;
  private totalHeaderLength = 8192;
  private data: Buffer;

  private firstIndexPtr: number;
  private lastIndexPtr: number;
  private totalBlocks: number;
  private headerIndexBuffer: Buffer;

  private headerSip: number[] = [];
  private headerPtr: number[] = [];
  private headerLen = 0;

  constructor(dbPath?: string) {
    const p = dbPath || "../../data/ip2region.db";
    this.dbFilePath = isAbsolute(p) ? p : pathResolve(__dirname, p);
    if (!existsSync(this.dbFilePath)) {
      throw new Error("[ip2region] db file not exists : " + this.dbFilePath);
    }

    this.data = readFileSync(this.dbFilePath);
    this.data.copy(this.superBlock, 0, 0, 8);

    this.firstIndexPtr = this.superBlock.readUInt32LE(0);
    this.lastIndexPtr = this.superBlock.readUInt32LE(4);
    this.totalBlocks = (this.lastIndexPtr - this.firstIndexPtr) / this.indexBlockLength + 1;

    debug(this.totalBlocks);

    this.headerIndexBuffer = Buffer.allocUnsafe(this.totalHeaderLength);

    let dataPtr = 0;
    // header index handler
    this.data.copy(this.headerIndexBuffer, 0, 8, this.totalHeaderLength + 8);

    let startIp = 0;
    for (let i = 0; i < this.totalHeaderLength; i += 8) {
      startIp = this.headerIndexBuffer.readUInt32LE(i);
      dataPtr = this.headerIndexBuffer.readUInt32LE(i + 4);
      if (dataPtr === 0) break;

      this.headerSip.push(startIp);
      this.headerPtr.push(dataPtr);
      // header index size count
      this.headerLen += 1;
    }
  }

  parseResult(res: Ipv4ToRegionRes) {
    // 城市Id|国家|区域|省份|城市|ISP
    const data = res.region.split("|");
    return {
      id: res.city,
      country: data[0],
      region: data[1],
      province: data[2],
      city: data[3],
      isp: data[4],
    };
  }

  search(ipaddr: string, parse: boolean = true) {
    if (!isIPv4(ipaddr)) return null;
    const ip = ipv4ToLong(ipaddr);
    // first search  (in header index)
    let low = 0;
    let mid = 0;
    let high = this.headerLen;
    let sptr = 0;
    let eptr = 0;

    while (low <= high) {
      mid = (low + high) >> 1;

      if (ip === this.headerSip[mid]) {
        if (mid > 0) {
          sptr = this.headerPtr[mid - 1];
          eptr = this.headerPtr[mid];
        } else {
          sptr = this.headerPtr[mid];
          eptr = this.headerPtr[mid + 1];
        }
        break;
      }

      if (ip < this.headerSip[mid]) {
        if (mid === 0) {
          sptr = this.headerPtr[mid];
          eptr = this.headerPtr[mid + 1];
          break;
        } else if (ip > this.headerSip[mid - 1]) {
          sptr = this.headerPtr[mid - 1];
          eptr = this.headerPtr[mid];
          break;
        }
        high = mid - 1;
      } else {
        if (mid === this.headerLen - 1) {
          sptr = this.headerPtr[mid - 1];
          eptr = this.headerPtr[mid];
          break;
        } else if (ip <= this.headerSip[mid + 1]) {
          sptr = this.headerPtr[mid];
          eptr = this.headerPtr[mid + 1];
          break;
        }
        low = mid + 1;
      }
    }

    // match nothing
    if (sptr === 0) return null;

    // second search (in index)
    const blockLen = eptr - sptr;
    low = 0;
    high = blockLen / this.indexBlockLength;

    let p = 0;
    let sip = 0;
    let eip = 0;
    let dataPtr = 0;

    while (low <= high) {
      mid = (low + high) >> 1;
      p = mid * this.indexBlockLength;
      sip = this.data.readUInt32LE(sptr + p);

      if (ip < sip) {
        high = mid - 1;
      } else {
        eip = this.data.readUInt32LE(sptr + p + 4);
        if (ip > eip) {
          low = mid + 1;
        } else {
          dataPtr = this.data.readUInt32LE(sptr + p + 8);
          break;
        }
      }
    }

    // read data
    if (dataPtr === 0) return null;
    const dataLen = (dataPtr >> 24) & 0xff;
    dataPtr = dataPtr & 0x00ffffff;
    const city_id = this.data.readUInt32LE(dataPtr);
    const data = this.data.toString("utf8", dataPtr + 4, dataPtr + dataLen);

    debug(city_id);
    debug(data);

    return parse ? this.parseResult({ city: city_id, region: data }) : { city: city_id, region: data };
  }
}
