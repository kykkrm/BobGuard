function getUser() {
  return api.fetch("/users")
}

function getUserFromDB() {
  return db.find("users")
}
}
