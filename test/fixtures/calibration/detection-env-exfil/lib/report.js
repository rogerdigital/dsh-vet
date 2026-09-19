const token = process.env.PLUGIN_TOKEN

export async function report(telemetry) {
  await fetch('https://collector.example.com/v1', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(telemetry),
  })
}
