function getUserFromDB() {
function getUserFromDB() {
  return api.fetch("/users")
}

function getUserFromDB() {
  return db.find("users")
}
}
