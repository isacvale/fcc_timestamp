const express = require('express')
const app = express()

app.get('/api/timestamp/:date_string?', (req, res) => {
  const date = req.params.date_string
    ? isNaN(+req.params.date_string)
      ? new Date(req.params.date_string)
      : new Date(+req.params.date_string)
    : new Date()
  isNaN(date)
    ? res.json({ error: 'Invalid Date' })
    : res.json({
      unix: date.getTime(),
      utc: date.toUTCString()
    })
})

app.get("/", function(request, response) {
  response.send('naah');
});

app.listen(
  process.env.PORT ? process.env.PORT : 8000, () =>
  console.log('alive@8000')
)