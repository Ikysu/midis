import fetch from 'async-request';
import cheerio from 'cheerio';
import fs from 'fs';
var lang = JSON.parse(fs.readFileSync("./language.json"));
var theFilter = JSON.parse(fs.readFileSync("./theFilter.json"));


function arequest(url, options) {
    return new Promise((resolve, reject)=>{
        fetch(url, options).then((e)=>{
            resolve(e)
        }).catch((e)=>{
            console.log(e)
            resolve({error:lang.errorRequest})
        })
    })
}

Array.prototype.gat=function(...name){
    return this.filter(e=>name.includes(e.name))
}

async function rest (authdata, method, params={}) {
    var res = (await arequest("https://portal.midis.info/rest/"+method+".json",{method:"POST",headers:{'Cookie':authdata.cookie},data:{sessid:authdata.sessid,...params}}))
    if(res.statusCode!=200) return {error:lang.midisRestError}
    return JSON.parse(res.body)
}

async function ajax (authdata, method, data) {
    var res = (await arequest("https://portal.midis.info/bitrix/"+method,{method:"POST",headers:{
        "bx-ajax":"true",
        "x-bitrix-site-id":"s1",
        'content-type':"application/x-www-form-urlencoded",
        'Cookie':authdata.cookie,
        "x-bitrix-csrf-token":authdata.sessid
    },data}))
    if(res.statusCode!=200) {
        return {error:lang.midisRestError}
    }
    return JSON.parse(res.body)
}

async function search(authdata, data) {
    var res = await arequest("https://portal.midis.info/company/", {
        headers: {
            "content-type": "application/x-www-form-urlencoded",
            'Cookie':authdata.cookie
        },
        data: {
            ajax_call:"y",
            INPUT_ID:"search-textbox-input",
            FORMAT:"json",
            q:data
        },
        method: "POST",
    })
    if(res.statusCode!=200) return {error:lang.midisRestError}
    return {data:JSON.parse(res.body.replace(/\'/gm,"\""))}
}

async function auth (login, password) {
    var res = await arequest(
        'https://portal.midis.info/auth/index.php?login=yes&backurl=%2Fauth%2F', {
            method: "POST",
            data: {
                'AUTH_FORM':'Y',
                'TYPE':'AUTH',
                'backurl':'/',
                'USER_LOGIN':login,
                'USER_PASSWORD':password
            }
        }
    )
    if(!(res.statusCode>=300 && res.statusCode<400)||res.body.length != 0) return {error:lang.badLoginOrPassword}
    var r = await arequest(
        'https://portal.midis.info/company/personal/user/1/common_security/?IFRAME=Y&IM_AJAX_CALL=Y', {
            method: "GET",
            headers:{
                'Cookie':[res.headers['set-cookie'][0]]
            }
        }
    )
    if(r.statusCode!=200) return {error:lang.statusNot200}
    var a = r.body.split('(window.BX||top.BX).message(');
    a=JSON.parse(a[a.length-1].split(");</script>")[0].replace(/\'/g, '"'));
    return {cookie:[res.headers['set-cookie'][0]],sessid:a.bitrix_sessid};
}

async function testAuth (authdata) {
    var res = (await arequest("https://portal.midis.info/rest/batch.json",{method:"POST",headers:{'Cookie':authdata.cookie},data:{sessid:authdata.sessid}}))
    if(res.statusCode==200){
        return {ok:true}
    }else{
        return {ok:false,error:lang.statusNot200}
    }
}

async function getSchedule (authdata, onlyCurrentDays=false) {
    var res = await arequest('https://portal.midis.info/schedule/?IFRAME=Y&IM_AJAX_CALL=Y',{method:"GET",headers:{'Cookie':authdata.cookie}})
    if(res.statusCode!=200) return {error:lang.statusNot200}
    var prop = cheerio.load(res.body)
    var groups = prop('div[class="subgroupContent"]')
    var out = {}
    groups.splice(0,groups.length/2).forEach(group=>{
        var info = group.children.gat("h4","h5","div")
        var groupName = info[0].children[0].data
        var outGroup = {}
        if(onlyCurrentDays) {
            outGroup.currentDays={
                thisDay:null,
                nextDay:null
            }
        }else{
            outGroup.weeks={
                firstWeek:[],
                secondWeek:[]
            }
        }
        for(let t=1;t<5;t+=2){
            var weekId = (info[t].children.gat("b")[0].children[0].data=="первую")?"firstWeek":"secondWeek"
            info[t+1].children.gat("div").forEach(dayInfo=>{
                var day = dayInfo.children.gat('div')[0].children.gat('div')[0].children.gat("h5", "table")
                var dayName = ((day[0].children[0].data)?day[0].children[0].data:day[0].children[0].children[0].data).trim()
                var nowTime = (dayName.search('Суббота')!=-1)?"sabbath":"normal" // Субботнее и нормальное (пн-пт)
                var cacheParaId = 0; 
                var outDay = {
                    dayName:dayName,
                    dayTimetable:nowTime,
                    dayPars:[]
                }
                day[1].children.gat("tbody")[0].children.gat("tr").forEach(tr=>{
                    var th = tr.children.gat("th")
                    var paraId = (th.length>0)?(+th[0].children[0].data):cacheParaId
                    cacheParaId=paraId
                    var paraInfo = tr.children.gat("td")
                    
                    function getText(tt){
                        var txt = ""
                        try {
                            txt = ((tt.data)?tt.data:((tt.children[0]&&tt.children[0].data)?tt.children[0].data:((tt.children[0]&&tt.children[0].children[0]&&tt.children[0].children[0].data)?tt.children[0].children[0].data:""))).trim()
                        }catch (e){

                        }
                        return txt 
                    }

                    var paraObject = getText(paraInfo[1]),
                        paraTeacher = getText(paraInfo[3]);
                    var altParaObject = null;

                    //Filter
                    Object.keys(theFilter).forEach((key)=>{
                        var filt = key.split(" - ");
                        if(filt.length>1){
                            if(filt[1]==paraTeacher){
                                var edited = paraObject.replace(filt[0], theFilter[key]);
                                if(paraObject!=edited) altParaObject=edited;
                            }
                        }else{
                            var edited = paraObject.replace(filt[0], theFilter[key]);
                            if(paraObject!=edited) altParaObject=edited;
                        }
                    })

                    var para = {
                        id:paraId,
                        flow:getText(paraInfo[0]),
                        "object":paraObject,
                        "class":getText(paraInfo[2]),
                        teacher:getText(paraInfo[3]),
                        danger:(tr.attribs.class===undefined) ? false:true
                    }
                    if(altParaObject) para.altObject=altParaObject;
                    outDay.dayPars.push(para)
                })
                
                if(onlyCurrentDays){
                    if(dayName.search('Сегодня')!=-1) outGroup.currentDays.thisDay=outDay
                    if(dayName.search('Завтра')!=-1) outGroup.currentDays.nextDay=outDay
                }else{
                    outGroup.weeks[weekId].push(outDay)
                }
            })
        }
        out[groupName]=outGroup
    })

    return out;
}

async function getProfile (authdata, anotherId) {
    if(anotherId){
        var res = await rest(authdata, 'user.get', {'ID':anotherId})
        if(res.error) return res;
        if(!res.result.length) return {error:lang.userNotFound}
        var r = await rest(authdata, 'department.get', {id: res.result[0].UF_DEPARTMENT[0]})
        if(r.error) return r;
        return {
            id:+res.result[0].ID,
            name:res.result[0].LAST_NAME+" "+res.result[0].NAME,
            pic:res.result[0].PERSONAL_PHOTO,
            group:r.result[0].NAME,
            type:res.result[0].WORK_POSITION,
            online:res.result[0].IS_ONLINE=="Y",
            last_activity:+new Date(res.result[0].LAST_LOGIN)
        };
    }else{
        var res = await rest(authdata, 'im.user.get')
        if(res.error) return res;
        var r = await rest(authdata, 'department.get', {id: res.result.departments[0]})
        if(r.error) return r;
        return {
            id:res.result.id,
            name:res.result.name,
            pic:res.result.avatar,
            group:r.result[0].NAME,
            type:res.result.work_position,
            online:true,
            last_activity:+new Date()
        };
    }
}

async function getDaily (authdata) {
    var res = await arequest('https://portal.midis.info/gradebook/daily.php?IFRAME=Y&IM_AJAX_CALL=Y',{method:"GET",headers:{'Cookie':authdata.cookie}})
    if(res.statusCode!=200) return {error:lang.statusNot200}
    var prop = cheerio.load(res.body)('table[class="table table-sm table-bordered"]')[0].children.gat('tbody')
    var out = {}
    prop.forEach(e => {
        var mark_date = e.children[0].children[0].children[0].data.trim()+" "+e.children[0].children[0].children[2].data.trim();
        e.children.forEach(ed => {
            var work = ed.children;
            var a = work[work.length-3].children[0].data;
            if(work[work.length-2].children[0]!=undefined){
                var b = work[work.length-2].children[0].data;
                var c = work[work.length-1].children;
                if(b != null && b != "" && b != "Зачет" && b != "Незачет"){
                    if(typeof out[a] == 'undefined'){
                        out[a]=[];
                    }
                    out[a].push({
                        date:mark_date,
                        mark:b,
                        details:(c.length>0)?c[0].data:""
                    })
                }
            }
        })
    })
    return out;
}

async function getAbsence (authdata) {
    var res = await arequest('https://portal.midis.info/gradebook/absence.php?IFRAME=Y&IM_AJAX_CALL=Y',{method:"GET",headers:{'Cookie':authdata.cookie}})
    if(res.statusCode!=200) return {error:lang.statusNot200}
    var prop = cheerio.load(res.body)('table[class="table table-sm table-bordered"]')[0].children.gat('tbody')[0].children.gat('tr')
    var out = {}
    prop.forEach(e => {
        var work = e.children;
        var a = work[work.length-2].children[0].data;
        if(out[a] == undefined){
            out[a]=[];
        }
        out[a].push({
            date:work[work.length-3].children[0].data,
            time:work[work.length-1].children[0].data
        })
    })
    return out;
}

export default {
    rest,
    ajax,
    search,
    auth,
    testAuth,
    getAbsence,
    getDaily,
    getProfile,
    getSchedule
}
