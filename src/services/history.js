// src/services/history.js
const fs = require('fs-extra');
const { HISTORY_FILE, METADATA_FILE } = require('../config');

// --- 原有的 IP 历史逻辑 ---
async function getHistory() {
       try {
              if (await fs.pathExists(HISTORY_FILE)) {
                     const data = await fs.readJson(HISTORY_FILE);
                     return Array.isArray(data) ? data : [];
              }
       } catch (e) { return []; }
       return [];
}

async function saveIp(ip) {
       let history = await getHistory();
       history = [ip, ...history.filter(item => item !== ip)].slice(0, 10);
       try {
              await fs.ensureFile(HISTORY_FILE);
              await fs.writeJson(HISTORY_FILE, history);
       } catch (e) { }
}

async function getMetadata() {
       try {
              if (await fs.pathExists(METADATA_FILE)) {
                     return await fs.readJson(METADATA_FILE);
              }
       } catch (e) { }
       return {};
}

async function saveMetadata(data) {
       try {
              const current = await getMetadata();
              await fs.ensureFile(METADATA_FILE);
              // 合并数据并保存
              await fs.writeJson(METADATA_FILE, { ...current, ...data }, { spaces: 2 });
       } catch (e) { }
}
/**
 * 批量删除 IP 记录
 * @param {string[]} ipsToDelete 要删除的 IP 数组
 */
async function deleteHistoryItems(ipsToDelete) {
       if (!Array.isArray(ipsToDelete) || ipsToDelete.length === 0) return false;

       let history = await getHistory();
       // 过滤掉所有在待删除列表中的 IP
       const updatedHistory = history.filter(ip => !ipsToDelete.includes(ip));

       try {
              await fs.ensureFile(HISTORY_FILE);
              await fs.writeJson(HISTORY_FILE, updatedHistory, { spaces: 2 });
              return true;
       } catch (e) {
              return false;
       }
}

/**
 * 新增：记录唯一的设备 GUID (不关联 IP)
 * @param {string} guid 匹配成功的 GUID
 */
async function saveGuid(guid) {
       if (!guid || guid === 'unknown') return;
       try {
              const metadata = await getMetadata();
              // 使用 Set 确保唯一性
              const knownGuids = new Set(metadata.known_guids || []);

              if (!knownGuids.has(guid)) {
                     knownGuids.add(guid);
                     await saveMetadata({ known_guids: Array.from(knownGuids) });
              }
       } catch (e) { }
}

/**
 * 新增：获取所有已配对过的设备 GUID 列表
 */
async function getKnownGuids() {
       const metadata = await getMetadata();
       return metadata.known_guids || [];
}
module.exports = {
       getHistory,
       saveIp,
       getMetadata,
       saveMetadata,
       deleteHistoryItems,
       saveGuid,       // 导出
       getKnownGuids,  // 导出
};