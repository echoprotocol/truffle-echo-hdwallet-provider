class Utils {
  static addressToId(ethLikeAddress: string): string {
    let idType = '';
    const withoutPrefix = ethLikeAddress.replace('0x', '');
    const signedBytes = withoutPrefix.substring(0, 2);
    switch (signedBytes) {
      case '00':
        idType = '2';
        break;
      case '01':
        idType = '11';
        break;
      default:
        break;
    }
    const idInstance = withoutPrefix.slice(-16);
    const id = Number(`0x${idInstance}`).toString(10);
    return `1.${idType}.${id}`;
  };

  static idToAddress(id: string): string {
    const addressLength = 40;
    const [, type, idValue] = id.split('.');
    let signedBytes = '';
    switch (type) {
      case '2':
        signedBytes = '00';
        break;
      case '11':
        signedBytes = '01';
        break;
      default:
        break;
    }
    const idIn16 = Number(idValue).toString(16)
    const ethLikeAddress = `0x${signedBytes + idIn16.padStart(addressLength - signedBytes.length, '0')}`
    return ethLikeAddress;
  }
}

export default Utils;
