# Interactive-only aliases for the Dust shared dev container.
# Sourced from dev/bashrc and dev/zshrc — not from BASH_ENV.

alias dust-us='gcloud config configurations activate us-central1 && gcloud container clusters get-credentials dust-kube --region us-central1'
alias dust-eu='gcloud config configurations activate europe-west1 && gcloud container clusters get-credentials dust-kube --region europe-west1'

alias gs='git-spice'

k8s_ssh () {
  if [ -z "$1" ]; then
    echo "Usage: k8s_ssh <pod_name>"
    return
  fi

  # can specify shell using a second argument, default to bash
  local k8s_shell="bash"
  if [ -n "$2" ]; then
    k8s_shell="$2"
  fi

  kubectl exec -it "$(kubectl get pods | grep "$1" | grep "Running" | awk 'NR==1{print $1}')" -- "$k8s_shell"
}

k8s_cp () {
  # k8s_cp <pod_name> <local_file> <remote_file>
  if [ -z "$3" ]; then
    echo "Usage: k8s_cp <pod_name> <local_file> <remote_file>"
    return
  fi
  if kubectl cp "$2" "$(kubectl get pods | grep "$1" | awk 'NR==1{print $1}')":"$3"; then
    echo "Copied $2 to $1:$3"
  else
    echo "Failed to copy $2 to $1:$3"
  fi
}

k8s_cp_from () {
  # k8s_cp_from <pod_name> <remote_file> <local_file>
  if [ -z "$3" ]; then
    echo "Usage: k8s_cp_from <pod_name> <remote_file> <local_file>"
    return
  fi
  if kubectl cp "$(kubectl get pods | grep "$1" | awk 'NR==1{print $1}')":"$2" "$3"; then
    echo "Copied $1:$2 to $3"
  else
    echo "Failed to copy $1:$2 to $3"
  fi
}
