import api from './midisApi.js';
import fs from 'fs';
import Fastify from 'fastify';
import formBodyPlugin from '@fastify/formbody';
import fastifyCors from '@fastify/cors';

var lang = JSON.parse(fs.readFileSync("./language.json"));

var apiVer = (+fs.readFileSync("whatUsay").toString());
apiVer++
fs.writeFileSync("whatUsay", `${apiVer}`)


var server = JSON.parse(fs.readFileSync("settings.json"))

var cnsl = console.log;
console.log = function (...data) {
    cnsl("["+(new Date()).toString().split(" ")[4]+"] |", ...data);
}

function authdata_encrypt(authdata) {
    const txt = JSON.stringify(authdata)
    const enc = [];
    for (let i = 0; i < txt.length; i += 1) {
        const keyC = server.secret[i % server.secret.length];
        const encC = `${String.fromCharCode((txt[i].charCodeAt(0) + keyC.charCodeAt(0)) % 256)}`;
        enc.push(encC);
    }
    const str = enc.join('');
    return Buffer.from(str, 'binary').toString('base64');
}

async function authdata_decrypt(authdata) {
    const dec = [];
    const enc = Buffer.from(authdata, 'base64').toString('binary');
    for (let i = 0; i < enc.length; i += 1) {
        const keyC = server.secret[i % server.secret.length];
        const decC = `${String.fromCharCode((256 + enc[i].charCodeAt(0) - keyC.charCodeAt(0)) % 256)}`;
        dec.push(decC);
    }

    try{
        var j = JSON.parse(dec.join(''))
        if(j.authdata&&j.login&&j.password){
            var test = await api.testAuth(j.authdata);
            var update = !!test.error;
            if(test.error){
                if(j.login.length!=6||!/[a-zA-Z0-9]/gm.test(j.login)||j.password.length!=6||!/[a-zA-Z0-9]/gm.test(j.password)) return {error:lang.errorTokenReloadBadData}
                var authdata = await api.auth(j.login, j.password);
                if(authdata.error) return authdata;
                j.authdata=authdata;
            }
            return {data:j,update}
        }else{
            return {error:lang.errorTokenReloadOld}
        }
        
    }catch(e){
        return {error:lang.parseError}
    }
}

const fastify = Fastify({
    logger:true
})

fastify.get("/info", async (reqs, reply)=>{
    try{
        return {version:apiVer,developers:server.devs}
    } catch (error) {
        console.log(error);
        return {error:lang.unknownError}
    }
})

fastify.post("/auth", async (reqs, reply)=>{
    try {
        if(!reqs.body) return {error:lang.noBody}
        if(!reqs.body.login||!reqs.body.password) return {error:lang.noLoginOrPassword}
        if(reqs.body.login.length!=6||!/[a-zA-Z0-9]/gm.test(reqs.body.login)||reqs.body.password.length!=6||!/[a-zA-Z0-9]/gm.test(reqs.body.password)) return {error:lang.badLoginOrPassword}

        var authdata = await api.auth(reqs.body.login, reqs.body.password);
        if(authdata.error) return authdata;

        return {token:authdata_encrypt({authdata, login:reqs.body.login, password:reqs.body.password})}

    } catch (error) {
        console.log(error);
        return {error:lang.unknownError}
    }
})

fastify.get("/test", async (reqs, reply)=>{
    try{
        if(!reqs.headers.authorization) return {error:lang.noAuthHeader}
        var ad = await authdata_decrypt(reqs.headers.authorization)
        if(ad.error) return ad;
        reply.header("Access-Control-Expose-Headers", "x-update");
        if(ad.update) reply.header("x-update", authdata_encrypt(ad.data));
        return {ok:true}
    } catch (error) {
        console.log(error);
        return {error:lang.unknownError}
    }
})

fastify.get("/schedule", async (reqs, reply)=>{
    try{
        if(!reqs.headers.authorization) return {error:lang.noAuthHeader}
        var ad = await authdata_decrypt(reqs.headers.authorization)
        if(ad.error) return ad;
        reply.header("Access-Control-Expose-Headers", "x-update");
        if(ad.update) reply.header("x-update", authdata_encrypt(ad.data));

        let sc = await api.getSchedule(ad.data.authdata);

        console.log(1, sc)

        return sc
    } catch (error) {
        console.log(error);
        return {error:lang.unknownError}
    }
})


fastify.get("/nowschedule", async (reqs, reply)=>{
    try{
        if(!reqs.headers.authorization) return {error:lang.noAuthHeader}
        var ad = await authdata_decrypt(reqs.headers.authorization)
        if(ad.error) return ad
        reply.header("Access-Control-Expose-Headers", "x-update");
        if(ad.update) reply.header("x-update", authdata_encrypt(ad.data));
        return await api.getSchedule(ad.data.authdata, true)
    } catch (error) {
        console.log(error);
        return {error:lang.unknownError}
    }
})

fastify.get("/widget_schedule", {
    schema: {
        security: [{ apiKey: [] }],
        description: 'Текущие расписание для виджета',
    }
}, async (reqs, reply)=>{
    try{
        console.log(!reqs.headers.authorization,reqs.headers.authorization!=12,!/[a-zA-Z0-9]/gm.test(reqs.headers.authorization))
        if(!reqs.headers.authorization||reqs.headers.authorization.length!=12||!/[a-zA-Z0-9]/gm.test(reqs.headers.authorization)) return `E%${lang.noAuthHeader.longmessage}`;
        var authdata = await api.auth(reqs.headers.authorization.slice(0,6), reqs.headers.authorization.slice(6));
        if(authdata.error) return `E%${authdata.error.longmessage}`;
        var data = await api.getSchedule(authdata, true);
        var out = []
        Object.keys(data).forEach(key=>{
            var {dayName,dayTimetable,dayPars} = data[key].currentDays.thisDay
            var ot = [key,dayName,dayTimetable];
            var pars = []
            dayPars.map((data)=>{
                pars.push(`${data.id}:${data["class"]+(data.danger?"(В/З)":"")}:${data["object"]+((data.flow!="Все")?` (${data.flow})`:"")}:${data.teacher}`)
            })
            ot.push(pars.join("@"))
            out.push(ot.join("!"));
        })
        return `D%${out.join("&")}` // D? П-38|00.00 Понедельник*normal*      &
    } catch (error) {
        console.log(error);
        return {error:lang.unknownError}
    }
})


fastify.get("/profile", async (reqs, reply)=>{
    try{
        if(!reqs.headers.authorization) return {error:lang.noAuthHeader}
        var ad = await authdata_decrypt(reqs.headers.authorization)
        if(ad.error) return ad
        reply.header("Access-Control-Expose-Headers", "x-update");
        if(ad.update) reply.header("x-update", authdata_encrypt(ad.data));
        return await api.getProfile(ad.data.authdata, reqs.query.userId)
    } catch (error) {
        console.log(error);
        return {error:lang.unknownError}
    }
})

fastify.get("/daily", async (reqs, reply)=>{
    try{
        if(!reqs.headers.authorization) return {error:lang.noAuthHeader}
        var ad = await authdata_decrypt(reqs.headers.authorization)
        if(ad.error) return ad
        reply.header("Access-Control-Expose-Headers", "x-update");
        if(ad.update) reply.header("x-update", authdata_encrypt(ad.data));
        return await api.getDaily(ad.data.authdata)
    } catch (error) {
        console.log(error);
        return {error:lang.unknownError}
    }
})

fastify.get("/absence", async (reqs, reply)=>{
    try{
        if(!reqs.headers.authorization) return {error:lang.noAuthHeader}
        var ad = await authdata_decrypt(reqs.headers.authorization)
        if(ad.error) return ad
        reply.header("Access-Control-Expose-Headers", "x-update");
        if(ad.update) reply.header("x-update", authdata_encrypt(ad.data));
        return await api.getAbsence(ad.data.authdata)
    } catch (error) {
        console.log(error);
        return {error:lang.unknownError}
    }
})

fastify.post("/rest/:method", async (reqs, reply)=>{
    try{
        if(!reqs.headers.authorization) return {error:lang.noAuthHeader}
        if(!reqs.body) return {error:lang.noBody}
        var ad = await authdata_decrypt(reqs.headers.authorization)
        if(ad.error) return ad
        reply.header("Access-Control-Expose-Headers", "x-update");
        if(ad.update) reply.header("x-update", authdata_encrypt(ad.data));
        return api.rest(ad.data.authdata, reqs.params.method, reqs.body);
    } catch (error) {
        console.log(error);
        return {error:lang.unknownError}
    }
})

fastify.post("/ajax", async (reqs, reply)=>{
    try{
        if(!reqs.headers.authorization) return {error:lang.noAuthHeader}
        var ad = await authdata_decrypt(reqs.headers.authorization)
        if(ad.error) return ad
        reply.header("Access-Control-Expose-Headers", "x-update");
        if(ad.update) reply.header("x-update", authdata_encrypt(ad.data));
        return api.ajax(ad.data.authdata, reqs.query[""] || reqs.query["url"], reqs.body);

        return {}
    } catch (error) {
        console.log(error);
        return {error:lang.unknownError}
    }
})

fastify.get("/ws", async (reqs, reply)=>{
    try{
        if(!reqs.headers.authorization) return {error:lang.noAuthHeader}
        var ad = await authdata_decrypt(reqs.headers.authorization)
        if(ad.error) return ad
        reply.header("Access-Control-Expose-Headers", "x-update");
        if(ad.update) reply.header("x-update", authdata_encrypt(ad.data));
        var cfg = await api.rest(ad.data.authdata, "pull.config.get", {
            "CACHE":"N"
        });
        if(cfg.error) return cfg
        if(cfg.error) return {error:{message:cfg.error,longmessage:cfg.error_description}}
        return {url:"wss://rtc-cloud-ms1.bitrix.info/subws/?CHANNEL_ID=" + encodeURIComponent(cfg.result.channels.private.id) + "%2F" + cfg.result.channels.shared.id + "&format=json&clientId="+cfg.result.clientId+"&revision=19"}
    } catch (error) {
        console.log(error);
        return {error:lang.unknownError}
    }
})

fastify.get("/search", async (reqs, reply)=>{
    try{
        if(!reqs.headers.authorization) return {error:lang.noAuthHeader}
        var ad = await authdata_decrypt(reqs.headers.authorization)
        if(ad.error) return ad
        reply.header("Access-Control-Expose-Headers", "x-update");
        if(ad.update) reply.header("x-update", authdata_encrypt(ad.data));
        
        var find = await api.search(ad.data.authdata, reqs.query[""] || reqs.query.text);
        return find
    } catch (error) {
        console.log(error);
        return {error:lang.unknownError}
    }
})

fastify.register(formBodyPlugin)
fastify.register(fastifyCors, { 
    methods:["POST", "GET"],
    origin:"*"
})

fastify.ready(err => {
    if (err) throw err
})

fastify.listen({
    host:server.host,
    port:server.port
});

console.log("Server init")