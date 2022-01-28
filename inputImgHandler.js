
const fileReader = new FileReader();

inputChange = () => {
    const files = imgFile.files;
    //バッファを確保、その後2バイトでtag読み、あとは変調してバイト読み込み
    fileReader.readAsArrayBuffer(files[0]);//ここの反応によっていろんなイベントが発生する
    //↑のイベントの一部、ファイル読み込み後に発火するonload(もしくは'load')を使用。
    fileReader.addEventListener('load', function(e) {
        const dataViewer = new DataView(e.target.result);
        console.log(dataViewer.byteLength);
        console.log(dataViewer.getInt16(200).toString(16));
        
        for (let i = 0; i < dataViewer.byteLength; i+=2) {
            if (dataViewer.getInt16(i).toString(16)=="312e") {
                console.log(`test group found. ${dataViewer.getInt16(i).toString(16)}`);
            } 
        }
        console.log("search finished.");

        // const readButton = document.getElementById('readButton');
        // let pushCounter = 0;
        // readButton.addEventListener('click', function (e) {
        //     console.log(dataViewer.getUint16(pushlasCounter).toString(16))
        //     pushCounter++
        //     console.log(pushCounter);
        // });
    })

}



const imgFile = document.getElementById('imgFile');
imgFile.addEventListener('change', inputChange);


