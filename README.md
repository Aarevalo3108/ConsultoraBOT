Este proyecto consiste en resolver la problemática de los servicios de consultas médicas (problemática que no solamente ocurre con este tipo de consultas, si no también con la atención al cliente), la problemática consiste en la dificultad que puede llegar a tener agendar una cita para cualquier dolencia médica, tomando desde lo más obvio como puede ser el tiempo que se necesita para asistir físicamente a una clínica, como a el desconocimiento de los horarios del doctor se nos asigna.

La idea general es la de desarrollar un chatbot de Whatsapp con un menú de registro y asignación de citas, todo para poner en practica y darle una interfaz grafica a los conocimientos adquiridos en la materia Base de Datos, valiéndose de la facilidad para crear y visualizar registros.

El lenguaje principal utilizado para desarrollar este software fue JavaScript, asi como también SQL para la base de datos.

El modelo de lenguaje utilizado es [dolphi 2.2.1 mistral 7B Q4_K_M](https://huggingface.co/TheBloke/dolphin-2.2.1-mistral-7B-GGUF/blob/main/dolphin-2.2.1-mistral-7b.Q4_K_M.gguf).

Proyecto realizado para la universidad UNEXPO, para la materia Base de Datos, dictada por Hector Zerpa.

Pasos para instalar librerias e iniciar el bot una vez copiado el repositorio:
```
npm install
npm start
```
Se debe crear previamente en un archivo .env las credenciales para acceder a la base de datos, asi como tambien tener la base de datos previamente creada.

Ejemplo de archivo .env:

```
HOST=localhost
USER=root
PASSWORD=12345678
NAME=DataBase
PORT=1234
```



### Creditos:
 CHATBOT Whatsapp (Baileys Provider)

<p align="center">
  <img width="300" src="https://i.imgur.com/Oauef6t.png">
</p>


**Con esta librería, puedes construir flujos automatizados de conversación de manera agnóstica al proveedor de WhatsApp,** configurar respuestas automatizadas para preguntas frecuentes, recibir y responder mensajes de manera automatizada, y hacer un seguimiento de las interacciones con los clientes.  Además, puedes configurar fácilmente disparadores que te ayudaran a expandir las funcionalidades sin límites. **[Ver más informacion](https://bot-whatsapp.netlify.app/)**

```js
const main = async () => {
    const adapterDB = new MockAdapter()
    const adapterFlow = createFlow([flowPrincipal])

    const adapterProvider = createProvider(BaileysProvider, {
        accountSid: process.env.ACC_SID,
        authToken: process.env.ACC_TOKEN,
        vendorNumber: process.env.ACC_VENDOR,
    })

    createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    })
}
```

---
## Recursos
- [📄 Documentación](https://bot-whatsapp.netlify.app/)
- [🚀 Roadmap](https://github.com/orgs/codigoencasa/projects/1)
- [💻 Discord](https://link.codigoencasa.com/DISCORD)
- [👌 Twitter](https://twitter.com/leifermendez)
- [🎥 Youtube](https://www.youtube.com/watch?v=5lEMCeWEJ8o&list=PL_WGMLcL4jzWPhdhcUyhbFU6bC0oJd2BR)
