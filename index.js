const express = require('express')
const cors = require('cors')
const bodyParser = require("body-parser");
const app = express()
const port = 3001

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const knex = require('knex')({
  client: 'mysql2',
  connection: {
    host : 'classproject.cluster-cbdo9oytyewz.us-east-2.rds.amazonaws.com',
    port : 3306,
    user : 'admin',
    password : 'admin123',
    database : 'studentemploymentdb'
  }
});

app.get('/', (req, res) => {
  res.send({
    code: 200,
    health: "Healthy"
  })
});

app.get('/get-table-data', async (req, res) => {
  var supervisors = await knex('Supervisor');

  var supervisorsWithEmployees = await Promise.all(supervisors.map(async el => {
    return knex('EmployeeSupervisorLink')
      .join('Employee', 'Employee.byuId', 'EmployeeSupervisorLink.employeeId')
      .join('EmployeePayInfo', 'Employee.byuId', 'EmployeePayInfo.employeeId')
      .where('supervisorId', el.id).then(employees => {
      return {
        supervisor: {
          firstName: el.firstName,
          lastName: el.lastName
        },
        employees: employees
      }
    })
  }));

  res.send(supervisorsWithEmployees);
})

app.post('/update-row', (req, res) => {
  knex('Employee').where('byuId', req.body.byuId)
  .update({
    [req.body.column]: req.body.value
  }).then(result => { res.status(200); res.send(); })
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`)
})