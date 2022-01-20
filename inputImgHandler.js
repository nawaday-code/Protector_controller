//テストとしてテキストを読んでみる

function inputChange() {
    let files = imgFile.files;
    let fileReader = new FileReader();

    fileReader.addEventListener('load', function(e) {
        console.log(e.target.result);
    });
    
    //バッファを確保、その後2バイトでtag読み、あとは変調してバイト読み込み
    fileReader.readAsArrayBuffer(files[0]);

}

let imgFile = document.getElementById('imgFile');
imgFile.addEventListener('change', inputChange);


