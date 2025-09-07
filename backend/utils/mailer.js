
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import dotenv from "dotenv";

dotenv.config();

const ses = new SESClient({
  region: process.env.AWS_REGION, 
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID_SES,     
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_SES
  }
});

export async function inviaEmail(destinatario, oggetto, testo) {
  const params = {
    Source: process.env.EMAIL_SES, 
    Destination: { ToAddresses: [destinatario] },
    Message: {
      Subject: { Data: oggetto, Charset: "UTF-8" },
      Body: { Text: { Data: testo, Charset: "UTF-8" } }
    }
  };

  try {
    const result = await ses.send(new SendEmailCommand(params));
    //console.log("Email inviata con SES:", result.MessageId);
    return result;
  } catch (err) {
    console.error(" Errore invio email:", err);
    throw err;
  }
}
