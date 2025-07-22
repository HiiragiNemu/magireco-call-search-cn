function ndownReset(htmlName) {
    // 删除输入信息
    document.getElementById('ndownword1').value = '';
    document.getElementById('ndownword2').value = '';
    allShow(); // 显示所有魔法少女
    ndownResetButternReset();
    if (document.forms["at_form"]) {
        document.forms["at_form"].reset();

        if(!htmlName){
        document.getElementById("at_result").style.border = "";
        document.getElementById("at_result").innerHTML = "";
        }
    }
}

function ndownResetButternCaution() {
    // 强调筛选重置按钮。
    let ndownResetEle = document.getElementsByClassName("ndownReset");
    Array.prototype.forEach.call(ndownResetEle, function (element) {
        element.classList.add("ndownReset_caution");
    });
}

function ndownResetButternReset() {
    // 取消筛选重置按钮的强调。
    let ndownResetEle = document.getElementsByClassName("ndownReset");
    Array.prototype.forEach.call(ndownResetEle, function (element) {
        element.classList.remove("ndownReset_caution");
    });
}