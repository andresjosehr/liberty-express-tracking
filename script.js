// Requiere instalar los siguientes paquetes:
// npm install axios cheerio @supabase/supabase-js

const axios = require('axios');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();


const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);



async function checkAndUpdateTracking() {
  try {

    const trackingNumber = process.env.TRACKING_NUMBER;
    const phoneNumber = process.env.PHONE_NUMBER;
    const callmebotApiKey = process.env.CALLMEBOT_API_KEY;
    
    const trackingUrl = `https://iqpack.libertyexpress.com/Tracking?nGuia=${trackingNumber}`;

    // 1. Hacer request a la URL de tracking
    const response = await axios.get(trackingUrl);
    const html = response.data;

    // 2. Parsear el HTML para extraer las etiquetas con las clases requeridas
    const $ = cheerio.load(html);
    const badges = [];
    $('.badge.badge-primary.large-text').each((i, el) => {
      badges.push($(el).text().trim());
    });
    console.log('Badges obtenidas:', badges);

    // 3. Consultar Supabase para verificar si el contenido ya existe para este tracking number
    // Nota: Usamos "nguia" en lugar de "nGuia" para coincidir con el nombre de la columna en la base de datos.
    const { data, error } = await supabase
      .from('tracking')
      .select('badge_data')
      .eq('nguia', trackingNumber);

    if (error) {
      console.error('Error consultando Supabase:', error);
      return;
    }

    let necesitaActualizar = false;
    if (data.length === 0) {
      // No existe registro, se requiere insertar uno nuevo
      necesitaActualizar = true;
      console.log('No se encontró registro para la guía. Se procederá a insertar.');
    } else {
      // Existe un registro; comparar la data almacenada con la recién obtenida
      const storedBadges = data[0].badge_data || [];
      console.log('Badges almacenadas en Supabase:', storedBadges);
      // Si hay alguna badge nueva que no esté almacenada, se debe actualizar
      for (let badge of badges) {
        if (!storedBadges.includes(badge)) {
          necesitaActualizar = true;
          break;
        }
      }
    }

    // 4. Si se detecta cambio o falta de datos, se hace un request a google.com y se actualiza/inserta en Supabase
    if (necesitaActualizar) {
      // Get last badge
      const lastBadge = badges[0];
      console.log('Last badge:', lastBadge);

      // Customize message
      const message = `El paquete con número de guía ${trackingNumber} ha cambiado de estado a: ${lastBadge}`;

      // Realizar un request a google.com (según requerimiento)
      fetch(`https://api.callmebot.com/whatsapp.php?phone=${phoneNumber}&apikey=${callmebotApiKey}&text=${message}`)
        .then(response => response.text())
        .then(data => console.log(data))
        .catch(error => console.error('Error:', error));
      
      if (data.length === 0) {
        // Insertar nuevo registro
        const { error: insertError } = await supabase
          .from('tracking')
          .insert([{ nguia: trackingNumber, badge_data: badges }]);
        if (insertError) {
          console.error('Error al insertar datos en Supabase:', insertError);
        } else {
          console.log('Registro insertado correctamente.');
        }
      } else {
        // Actualizar registro existente
        const { error: updateError } = await supabase
          .from('tracking')
          .update({ badge_data: badges })
          .eq('nguia', trackingNumber);
        if (updateError) {
          console.error('Error al actualizar datos en Supabase:', updateError);
        } else {
          console.log('Registro actualizado correctamente.');
        }
      }
    } else {
      console.log('No se detectaron cambios, no es necesario actualizar.');
    }
  } catch (err) {
    console.error('Error durante el proceso:', err);
  }
}

// Ejecuta la función inmediatamente y luego la vuelve a ejecutar cada minuto (60000 milisegundos)
checkAndUpdateTracking();
