/**
 * 错误匹配规则配置
 * regular: 匹配模式，支持字符串占位符或正则对象
 * code: 匹配成功后返回的统一错误码
 */
const ERROR_RULES = [
       {
              // 匹配：failed to authenticate to 192.168.1.1:5555
              // 也匹配：failed to authenticate
              regular: 'failed to authenticate',
              code: 'AUTH_FAILED'
       },
       {
              // 匹配：cannot connect to 192.168.1.12:43671: 由于目标计算机积极拒绝...
              regular: 'cannot connect to ip:port',
              code: 'NETWORK_REFUSED'
       },
       {
              // 支持使用 ip:port 占位符简化书写
              regular: 'failed to connect to ip:port',
              code: 'AUTH_FAILED'
       },
       {
              // 针对 10061 错误码的匹配
              regular: '10061',
              code: 'NETWORK_REFUSED'
       },
       {
              // 演示：设备离线
              regular: 'device offline',
              code: 'DEVICE_OFFLINE'
       },
       {
              // 演示：使用原生正则匹配多重情况
              regular: /more than one device/i,
              code: 'MULTIPLE_DEVICES'
       },
       {
              // 新增：协议错误
              regular: 'protocol fault',
              code: 'ADB_SERVER_ERROR'
       },
];

module.exports = ERROR_RULES;