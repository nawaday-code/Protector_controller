//＜＜注意＞＞デフォルトでは、
// C#のBinaryReader.ReadInt16()はリトルエンディアン、
// javascriptのDataView.gerInt16はビッグエンディアン
// DICOMのバイト配列はリトルエンディアン
// javascriptで読み込む際はgetInt16(_, true)
// 第二引数をtrueにしてリトルエンディアンで読み込むこと

const fileReader = new FileReader();
const dcmFile = document.getElementById('dcmFile');
dcmFile.addEventListener('change', inputChange);

function inputChange(){
    const files = dcmFile.files;
    //バッファを確保、その後2バイトでtag読み、あとは変調してバイト読み込み
    fileReader.readAsArrayBuffer(files[0]);//ここの反応によっていろんなイベントが発生する
    //↑のイベントの一部、ファイル読み込み後に発火するonload(もしくは'load')を使用。
    fileReader.addEventListener('load', function(e) {
        const dataViewer = new DataView(e.target.result);
        const imgInfo = getScaledImageData(dataViewer);
        
        //ここはhtmlUI上で選択できるようにしたい
        let seekTag = [
            new Map([[0x0008, 0x0080]])
        ];
        const seekTagData = getTagInfo(dataViewer, seekTag);
        console.log(seekTagData.get("(0008,0080)"));
        console.log(seekTagData)
        //canvasに画像表示
        let canvas = document.getElementById('imgView');
        canvas.width = imgInfo.get("width");
        canvas.height = imgInfo.get("height");
        let ctx = canvas.getContext('2d');
        let img = setImage(ctx, imgInfo);
        ctx.putImageData(img, 0, 0);
    })

    //トリミング処理
    //複数のDICOMに対する処理
    //出力処理
}



function setImage(ctx, imgInfo) {
    let imgData = ctx.createImageData(imgInfo.get("width"), imgInfo.get("height"));
    const signalData = imgInfo.get("image");
    let data = imgData.data;
    for (let data_i = 0, signal_i=0; data_i < data.length, signal_i < signalData.length; data_i++, signal_i++){
        data[4*data_i] = normalizeToUint8(signalData[signal_i]);    //red
        data[4*data_i+1] = normalizeToUint8(signalData[signal_i]);   //green
        data[4*data_i+2] = normalizeToUint8(signalData[signal_i]);  //blue
        data[4*data_i+3] = 255                    //alpha
    }
    return imgData;
}

//あえてメッセージになるよう定義
function normalizeToUint8(value_uint16) {
    return (value_uint16*255)/4095;
}

function getScaledImageData(dataView) {
    // let readDict = new Map();
    let imgTags = [
        new Map([[0x0028,0x0010]]),//Rows
        new Map([[0x0028,0x0011]]),//Columns
        new Map([[0x0028,0x1052]]),//Rescale Intercept
        new Map([[0x0028,0x1053]]),//Rescale Slope
        new Map([[0x7FE0,0x0010]]), //Pixel Data
    ]
    const readDict = getTagInfo(dataView, imgTags);
    return new Map([
        ["height", readDict.get("(0028,0010)")],
        ["width", readDict.get("(0028,0011)")],
        ["image", imgMaker(readDict, true)]]);
}

function imgMaker(readDict, isInvert) {
    //スケーリングによって実数になると以下のコードは微妙かも
    const trueValue = readDict.get("(7fe0,0010)").map(v => v * Number(readDict.get("(0028,1053)")) + Number(readDict.get("(0028,1052)")));
    return isInvert ? trueValue.map(v=>4095-v) : trueValue
}

function getTagInfo(dataView, tagDict) {
    let resultDict = new Map();
    //検索アルゴリズムを変えられればもっと処理が早くなる
    //現段階では上から順に検索
    for (let offset = 0; offset < dataView.byteLength; offset+=2) {
        const currentGroup = dataView.getUint16(offset, true);
        if (tagDict.some(tag => tag.has(currentGroup))) {
            const currentElement = dataView.getUint16(offset+2, true);
            if(tagDict.some(tag => tag.get(currentGroup) === currentElement)){
                const currentTag =`(${('0000' + currentGroup.toString(16)).slice(-4)},${('0000' + currentElement.toString(16)).slice(-4)})`
                resultDict.set(currentTag, tagDataReader(dataView, offset+4));
            }
        }
    }
    return resultDict;
}

function tagDataReader(dataView, offset) {
    let dataLength = 0;
    let data;
    const VR = getUint8Array(dataView, offset, 4);
    //以下、データ型の追加がまだまだ必要。後々追加。
    switch (String.fromCharCode(VR[0])+String.fromCharCode(VR[1])) {
        case "DS":
            dataLength = VR[3] * 256 + VR[2];
            data = getUint8Array(dataView, offset + 4, dataLength);//ここもgetUint16Array?
            return data.map(v => String.fromCharCode(v)).join("");
        case "US":
            dataLength = VR[3] * 256 + VR[2];
            //データ型によってデータ中身の読み込み方法まで違う
            data = dataView.getUint16(offset+4, true);
            return data;
        case "LO":
            dataLength = VR[3] * 256 + VR[2];
            data = getUint8Array(dataView, offset + 4, dataLength);
            return data.map(v => String.fromCharCode(v)).join("");
        case "OW":
            //dataLengthBuffer(dLB)
            const dLB = getUint8Array(dataView, offset+4, 4);
            dataLength = dLB[3] * 256 ** 3 + dLB[2] * 256 ** 2 + dLB[1] * 256 + dLB[0];
            data = getUint16Array(dataView, offset + 8, dataLength);
            return data;  
        default:
            dataLength = VR[3] * 256 ** 3 + VR[2] * 256 ** 2 + VR[1] * 256 + VR[0];
            data = getUint8Array(dataView, offset + 4, dataLength);
            return data;
    }
}

function getUint8Array(dataView, offset, length){
    return Array.from(Array(length), (_v, k) => dataView.getUint8(offset+k, true))
}
//2byteずつ読むので配列の長さは半分になる
function getUint16Array(dataView, offset, length){
    return Array.from(Array(Math.floor(length/2)), (_v, k) => dataView.getUint16(offset+k*2, true))
}

