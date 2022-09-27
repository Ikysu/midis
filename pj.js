import Fastify from 'fastify';
import formBodyPlugin from '@fastify/formbody';
import fastifyCors from '@fastify/cors';

const fastify = Fastify({
    logger:true
})

fastify.get("/test", async(req, reply)=>{
    reply.send({ok:true})
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
    host:"0.0.0.0",
    port:1200
});