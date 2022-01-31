//＜＜注意＞＞デフォルトでは、
// C#のBinaryReader.ReadInt16()はリトルエンディアン、
// javascriptのDataView.gerInt16はビッグエンディアン
// DICOMのバイト配列はリトルエンディアン
// javascriptで読み込む際はgetInt16(_, true)
// 第二引数をtrueにしてリトルエンディアンで読み込むこと

const fileReader = new FileReader();

let canvas = document.getElementById('imgView');
let ctx = canvas.getContext('2d');
canvas.width = 256;
canvas.height = 256;
let dst = ctx.createImageData(canvas.width , canvas.height);
dst.data = [[1,2,3],[4,5,6],[7,8,9]];
// for (var i = 0; i < canvas.height; i++) {
//     for (var j = 0; j < canvas.width; j++) {
         
//          var pix = (i*canvas.width + j) * 4;     // i-j Coordinate

//          dst.data[pix] = i;       // Red
//          dst.data[pix+1] = 0;     // Green
//          dst.data[pix+2] = 0;     // Blue
//          dst.data[pix+3] = 255;   // Alpha
//     }
// }

ctx.putImageData(dst, 0, 0);


const imgFile = document.getElementById('imgFile');
imgFile.addEventListener('change', inputChange);

function inputChange(){
    const files = imgFile.files;
    //バッファを確保、その後2バイトでtag読み、あとは変調してバイト読み込み
    fileReader.readAsArrayBuffer(files[0]);//ここの反応によっていろんなイベントが発生する
    //↑のイベントの一部、ファイル読み込み後に発火するonload(もしくは'load')を使用。
    fileReader.addEventListener('load', function(e) {
        const dataViewer = new DataView(e.target.result);
        //以下は画像読み込みfuncでcapsulize
        getScaledImage(dataViewer);
        //canvasに画像表示
    })
}

function getScaledImage(dataView) {
    let infoDict = new Map();
    let imgTags = [
        new Map([[0x0028, 0x0010]]),//Rows
        new Map([[0x0028, 0x0011]]),//Columns
        new Map([[0x0028, 0x1052]]),//Rescale Intercept
        new Map([[0x0028, 0x1053]]),//Rescale Slope
        new Map([[0x7FE0,0x0010]]), //Pixel Data
    ]
    const tagOffsetDict = getTagOffset(dataView, imgTags);
    //ここのアロー関数引数は(key, value)ではないことに注意
    tagOffsetDict.forEach((value, key) =>{
        infoDict.set(key, tagDataReader(dataView, value))
    })
    console.log(infoDict);
    return imgMaker(infoDict);
}

function imgMaker(imgInfoDict) {
    const scaledArray = imgInfoDict.get("(7fe0, 0010)").map(v => v * Number(imgInfoDict.get("(0028, 1053)")) + Number(imgInfoDict.get("(0028, 1052)")));

}
// const arr = [1,2,3,4,5,6,7,8,9];
    
// const newArr = [];
// while(arr.length) newArr.push(arr.splice(0,3));
    
// console.log(newArr);

function getTagOffset(dataView, tags) {
    let resultDict = new Map();

    for (let offset = 0; offset < dataView.byteLength; offset+=2) {
        const currentGroup = dataView.getUint16(offset, true);
        if (tags.some(tag => tag.has(currentGroup))) {
            const currentElement = dataView.getUint16(offset+2, true);
            if(tags.some(tag => tag.get(currentGroup) === currentElement)){
                const currentTag =`(${('0000' + currentGroup.toString(16)).slice(-4)}, ${('0000' + currentElement.toString(16)).slice(-4)})`
                // const currentTag = new Map([
                //     [currentGroup.toString(16), currentElement.toString(16)]
                // ])
                resultDict.set(currentTag,offset+4);
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
            dataLength = VR[3] * 10 + VR[2];
            data = getUint8Array(dataView, offset + 4, dataLength);
            return data.map(v => String.fromCharCode(v)).join("");
        case "US":
            dataLength = VR[3] * 10 + VR[2];
            //データ型によってデータ中身の読み込み方法まで違う
            data = dataView.getUint16(offset+4, true);
            return data;
        case "LO":
            dataLength = VR[3] * 10 + VR[2];
            data = getUint8Array(dataView, offset + 4, dataLength);
            return data.map(v => String.fromCharCode(v)).join("");
        case "OW":
            //dataLengthBuffer(dLB)
            const dLB = getUint8Array(dataView, offset+4, 4);
            dataLength = dLB[3] * 10 ** 3 + dLB[2] * 10 ** 2 + dLB[1] * 10 + dLB[0];
            data = getUint8Array(dataView, offset+8, dataLength);
            return data;  
        default:
            dataLength = VR[3] * 10 ** 3 + VR[2] * 10 ** 2 + VR[1] * 10 + VR[0];
            data = getUint8Array(dataView, offset + 4, dataLength);
            return data;
    }
}

getUint8Array = (dataView, offset, length) => {
    return Array.from(Array(length), (_v, k) => dataView.getUint8(offset+k, true))
}
