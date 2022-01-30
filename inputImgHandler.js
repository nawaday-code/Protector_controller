//＜＜注意＞＞デフォルトでは、
// C#のBinaryReader.ReadInt16()はリトルエンディアン、
// javascriptのDataView.gerInt16はビッグエンディアン
// DICOMのバイト配列はリトルエンディアン
// javascriptで読み込む際はgetInt16(_, true)
// 第二引数をtrueにしてリトルエンディアンで読み込むこと

const fileReader = new FileReader();

getInt8Array = (dataView, offset, length) => {
    return Array.from(Array(length), (v, k) => dataView.getInt8(offset+k, true))
}

inputChange = () => {
    const files = imgFile.files;
    //バッファを確保、その後2バイトでtag読み、あとは変調してバイト読み込み
    fileReader.readAsArrayBuffer(files[0]);//ここの反応によっていろんなイベントが発生する
    //↑のイベントの一部、ファイル読み込み後に発火するonload(もしくは'load')を使用。
    fileReader.addEventListener('load', function(e) {
        const dataViewer = new DataView(e.target.result);
        //以下は画像読み込みfuncでcapsulize
        getScaledImage(dataViewer);
    })

}



const imgFile = document.getElementById('imgFile');
imgFile.addEventListener('change', inputChange);


function getScaledImage(dataViewer) {
    let imgTags = [
        {group:0x0028, element:0x1052},
        {group:0x0028, element:0x1053}
    ];
    
    // {0x0028:[0x1052, 0x1053]};
    let resultDict = getTagInfo(dataViewer, imgTags);
    console.log(resultDict);
    // for (let i = 0; i < dataViewer.byteLength; i += 2) {
    //     switch (dataViewer.getInt16(i, true)) {
    //         case 0x0028:
    //             //2byte分オフセットを進める
    //             switch (dataViewer.getInt16(i + 2, true)) {
    //                 case 0x1052:
    //                     headerReader(dataViewer, i+4);
    //                     break;
    //                 case 0x1053:
    //                     headerReader(dataViewer, i+4);
    //                     break;
    //                 default:
    //                     break;
    //             }
    //             break;

    //         default:
    //             break;
    //     }

    // }
}

function getTagInfo(dataViewer, tags) {
    let resultDict = {};

    for (let offset = 0; offset < dataViewer.byteLength; offset +=2) {
        const currentGroup = dataViewer.getInt16(offset, true);
        if (tags.some(tag => tag.group === currentGroup)) {
            const currentElement = dataViewer.getInt16(offset + 2, true);
            if(tags.some(tag => tag.element === currentElement)){
                console.log(currentGroup.toString(16));
                console.log(currentElement.toString(16));

                resultDict[{group:currentGroup.toString(16), element:currentElement.toString(16)}] = headerReader(dataViewer, offset+4);
            }
        }
    }
    return resultDict;
}

function headerReader(dataViewer, offset) {
    let dataLength = 0;
    //2byte分オフセットを進める
    let VR = getInt8Array(dataViewer, offset, 4);
    //すべてがリトルエンディアンというわけではない
    //VRはビッグエンディアン、データの長さはリトルエンディアン。ややこしい
    switch (String.fromCharCode(VR[0])+String.fromCharCode(VR[1])) {
        case "DS":
            dataLength = VR[3] * 10 + VR[2];
            break;
        // 画像は別funcで作る
        // case "OW":
        //     getInt8Array(dataViewer, offset+4,4)
        //     break;
        default:
            dataLength = VR[3] * 10 ** 3 + VR[2] * 10 ** 2 + VR[1] * 10 + VR[0];
            break;
    }
    let data = getInt8Array(dataViewer, offset + 4, dataLength);
    return data.map(v => String.fromCharCode(v));
}

