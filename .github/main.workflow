workflow "build, test and publish on release" {
  on = "push"
  resolves = "publish"
}

action "check for new tag" {
  uses = "actions/bin/filter@master"
  args = "tag"
}

action "pull submodules" {
  needs = "check for new tag"
  uses = "docker://node:10"
  runs = "git"
  args = "submodule update --init"
}

action "install" {
  uses = "docker://node:10"
  needs = "pull submodules"
  runs = "npm"
  args = "install"
}

action "build" {
  needs = "install"
  uses = "actions/npm@master"
  args = "run build"
}

action "test" {
  needs = "install"
  uses = "actions/npm@master"
  args = "test"
}

action "publish" {
  needs = ["build", "test"]
  uses = "actions/npm@master"
  args = "publish --access public"
  secrets = ["NPM_AUTH_TOKEN"]
}
